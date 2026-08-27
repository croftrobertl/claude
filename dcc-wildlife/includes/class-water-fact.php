<?php
/**
 * Water module — the fact value object and its confidence tiers.
 *
 * THIS CLASS IS THE SAFETY MECHANISM FOR THE WHOLE MODULE.
 *
 * The owner's hard rule: "I'd rather exclude false information and have
 * missing informational pieces than tell people something that's not true."
 * That is enforced structurally here, not editorially:
 *
 *   - The constructor is private.
 *   - The ONLY way to obtain a Fact is Fact::make(), which returns null
 *     unless the input carries a valid tier, a non-empty source name, a
 *     non-empty date and a non-empty value.
 *   - The renderer accepts Fact objects only.
 *
 * Therefore no code path exists that can display an unsourced claim. A
 * field with no source does not become "unknown" on the page — it ceases
 * to exist, and the card renders without that row.
 *
 * Do not add a public constructor, a ::raw() escape hatch, or a "trust me"
 * flag. Those would defeat the only guarantee this module makes.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Water_Fact {

	/** A measurement fetched now from an official gauge/API. */
	public const TIER_LIVE = 'live';
	/** A figure from an official published dataset. */
	public const TIER_PUBLISHED = 'published';
	/** Widely-accepted angling guidance, not site-specific. */
	public const TIER_GENERAL = 'general';

	/**
	 * Tiers that may reach the page. Anything not in this list is omitted.
	 *
	 * @return string[]
	 */
	public static function tiers(): array {
		return [ self::TIER_LIVE, self::TIER_PUBLISHED, self::TIER_GENERAL ];
	}

	private function __construct(
		private string $label,
		private string $value,
		private string $tier,
		private string $source_name,
		private string $source_url,
		private string $date,
		private string $note,
		private string $date_label,
		private string $group
	) {}

	/**
	 * The single gate. Returns null — never a partial Fact — when the input
	 * cannot be attributed.
	 *
	 * Required: label, value, tier (one of tiers()), source_name, date.
	 * Optional: source_url, note, date_label, group.
	 *
	 * `date_label` is presentation only — the word in front of the date
	 * ("reading" for a gauge, "sampled" for a lab sample). It is NOT part
	 * of the gate: a fact still cannot exist without a real date, and an
	 * absent label just falls back to the default wording. `group` is the
	 * same: it only decides which list a fact is rendered in.
	 *
	 * @param array<string,mixed> $raw
	 */
	public static function make( array $raw ): ?self {
		$label  = trim( (string) ( $raw['label'] ?? '' ) );
		$value  = trim( (string) ( $raw['value'] ?? '' ) );
		$tier   = trim( (string) ( $raw['tier'] ?? '' ) );
		$sname  = trim( (string) ( $raw['source_name'] ?? '' ) );
		$surl   = trim( (string) ( $raw['source_url'] ?? '' ) );
		$date   = trim( (string) ( $raw['date'] ?? '' ) );
		$note   = trim( (string) ( $raw['note'] ?? '' ) );
		$dlabel = trim( (string) ( $raw['date_label'] ?? '' ) );
		$group  = trim( (string) ( $raw['group'] ?? '' ) );

		if ( '' === $label || '' === $value ) {
			return null;
		}
		if ( ! in_array( $tier, self::tiers(), true ) ) {
			return null;
		}
		if ( '' === $sname ) {
			return null;
		}
		if ( ! self::valid_date( $date ) ) {
			return null;
		}
		// A malformed URL is dropped rather than rendered; the fact still
		// stands on its named source.
		if ( '' !== $surl ) {
			$surl = esc_url_raw( $surl );
			if ( '' === $surl || ! preg_match( '#^https?://#i', $surl ) ) {
				$surl = '';
			}
		}

		return new self( $label, $value, $tier, $sname, $surl, $date, $note, $dlabel, $group );
	}

	/**
	 * Accepts a year (2019), a month (2019-07), a date (2019-07-04) or a
	 * full ISO-8601 instant (live gauge readings). Everything else fails.
	 */
	public static function valid_date( string $date ): bool {
		if ( '' === $date ) {
			return false;
		}
		if ( preg_match( '/^\d{4}(-\d{2}(-\d{2})?)?$/', $date ) ) {
			return true;
		}
		return (bool) preg_match( '/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/', $date );
	}

	public function label(): string {
		return $this->label;
	}

	public function tier(): string {
		return $this->tier;
	}

	/**
	 * Shape handed to the REST layer / JS. Every key here is guaranteed
	 * non-empty except source_url and note.
	 *
	 * @return array<string,string>
	 */
	public function to_array(): array {
		return [
			'label'      => $this->label,
			'value'      => $this->value,
			'tier'       => $this->tier,
			'sourceName' => $this->source_name,
			'sourceUrl'  => $this->source_url,
			'date'       => $this->date,
			'note'       => $this->note,
			'dateLabel'  => $this->date_label,
			'group'      => $this->group,
		];
	}

	/**
	 * Map a list of raw arrays to Facts, silently dropping every entry that
	 * cannot be attributed.
	 *
	 * @param array<int,array<string,mixed>> $rows
	 * @return self[]
	 */
	public static function collect( array $rows ): array {
		$out = [];
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$fact = self::make( $row );
			if ( $fact instanceof self ) {
				$out[] = $fact;
			}
		}
		return $out;
	}

	/**
	 * How many of the supplied rows were rejected. Used by the admin screen
	 * to tell the owner exactly what was dropped and why, so the gating is
	 * visible rather than mysterious.
	 *
	 * @param array<int,array<string,mixed>> $rows
	 * @return array<int,string> Human-readable reasons, keyed by row index.
	 */
	public static function rejection_reasons( array $rows ): array {
		$reasons = [];
		foreach ( $rows as $i => $row ) {
			if ( ! is_array( $row ) ) {
				$reasons[ $i ] = __( 'Not a valid entry.', 'dcc-wildlife' );
				continue;
			}
			if ( self::make( $row ) instanceof self ) {
				continue;
			}
			$missing = [];
			if ( '' === trim( (string) ( $row['label'] ?? '' ) ) ) {
				$missing[] = __( 'field name', 'dcc-wildlife' );
			}
			if ( '' === trim( (string) ( $row['value'] ?? '' ) ) ) {
				$missing[] = __( 'value', 'dcc-wildlife' );
			}
			if ( ! in_array( trim( (string) ( $row['tier'] ?? '' ) ), self::tiers(), true ) ) {
				$missing[] = __( 'confidence tier', 'dcc-wildlife' );
			}
			if ( '' === trim( (string) ( $row['source_name'] ?? '' ) ) ) {
				$missing[] = __( 'source name', 'dcc-wildlife' );
			}
			if ( ! self::valid_date( trim( (string) ( $row['date'] ?? '' ) ) ) ) {
				$missing[] = __( 'date (YYYY, YYYY-MM or YYYY-MM-DD)', 'dcc-wildlife' );
			}
			$reasons[ $i ] = implode( ', ', $missing );
		}
		return $reasons;
	}
}
