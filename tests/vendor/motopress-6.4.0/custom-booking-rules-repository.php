<?php

declare(strict_types=1);

namespace MPHB\Repositories;

use MPHB\Utils\DateUtils;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class CustomBookingRulesRepository {
	private const TABLE_CUSTOM_BOOKING_RULES = 'mphb_custom_booking_rules';

	/**
	 * @global \wpdb $wpdb
	 */
	public function createTable(): void {
		global $wpdb;

		$wpdb->query(
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL
			"CREATE TABLE IF NOT EXISTS {$this->getTableName()} ("
				. ' room_type_id INT UNSIGNED NOT NULL,'
				. ' `date` DATE NOT NULL,'
				. ' allow_check_in BOOLEAN,'
				. ' allow_check_out BOOLEAN,'
				. ' buffer_days SMALLINT UNSIGNED,'
				. ' min_stay_length SMALLINT UNSIGNED,'
				. ' max_stay_length SMALLINT UNSIGNED,'
				. ' min_advance_reservation SMALLINT UNSIGNED,'
				. ' max_advance_reservation SMALLINT UNSIGNED,'
				. ' PRIMARY KEY (room_type_id, `date`)'
				. ' ) CHARSET=utf8'
		);
	}

	/**
	 * @param string[] $dates
	 *
	 * @global \wpdb $wpdb
	 */
	public function deleteRules( int $roomTypeId, array $dates ): void {
		global $wpdb;

		$datesPlaceholder = array_fill( 0, count( $dates ), '%s' );
		$datesPlaceholder = implode( ', ', $datesPlaceholder );

		$wpdb->query(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL
				"DELETE FROM {$this->getTableName()}"
					// phpcs:ignore -- array placeholder
					. " WHERE room_type_id = %d AND `date` IN ({$datesPlaceholder})",
				array_merge( array( $roomTypeId ), $dates )
			)
		);
	}

	/**
	 * @param string|\DateTime $dateFrom
	 * @param string|\DateTime $dateTo
	 * @return string[]
	 *
	 * @global \wpdb $wpdb
	 */
	public function getExistingDatesForPeriod( int $roomTypeId, $dateFrom, $dateTo ): array {
		global $wpdb;

		$dateFromStr = is_string( $dateFrom ) ? $dateFrom : DateUtils::formatDateDB( $dateFrom );
		$dateToStr   = is_string( $dateTo )   ? $dateTo   : DateUtils::formatDateDB( $dateTo );

		$existingDates = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT `date` FROM {$this->getTableName()}"
					. ' WHERE room_type_id = %d AND `date` BETWEEN %s AND %s',
				$roomTypeId,
				$dateFromStr,
				$dateToStr
			)
		);

		return $existingDates;
	}

	public function getMaxBufferDays( int $roomTypeId = 0 ): int {
		global $wpdb;

		// phpcs:ignore WordPress.DB.PreparedSQL
		$selectSql = "SELECT MAX(buffer_days) FROM {$this->getTableName()}"
			. ' WHERE buffer_days IS NOT NULL';

		if ( $roomTypeId !== 0 ) {
			$selectSql = $wpdb->prepare(
				$selectSql . ' AND room_type_id = %d',
				$roomTypeId
			);
		}

		$maxBuffer = $wpdb->get_var( $selectSql );

		return ! is_null( $maxBuffer ) ? (int) $maxBuffer : 0;
	}

	/**
	 * @param string[] $dates
	 * @return array <code>[ Date string ("Y-m-d") => Rules (array) ]</code>
	 *
	 * @global \wpdb $wpdb
	 */
	public function getRules( int $roomTypeId, array $dates ): array {
		global $wpdb;

		$datesPlaceholder = array_fill( 0, count( $dates ), '%s' );
		$datesPlaceholder = implode( ', ', $datesPlaceholder );

		$rows = $wpdb->get_results(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL
				"SELECT * FROM {$this->getTableName()}"
					// phpcs:ignore -- array placeholder
					. " WHERE room_type_id = %d AND `date` IN ({$datesPlaceholder})",
				array_merge( array( $roomTypeId ), $dates )
			),
			ARRAY_A
		);

		return $this->mapToRules( $rows );
	}

	/**
	 * @param string|\DateTime $dateFrom
	 * @param string|\DateTime $dateTo
	 * @return array <code>[ Date string ("Y-m-d") => Rules (array) ]</code>
	 *
	 * @global \wpdb $wpdb
	 */
	public function getRulesForPeriod( int $roomTypeId, $dateFrom, $dateTo ): array {
		global $wpdb;

		$dateFromStr = is_string( $dateFrom ) ? $dateFrom : DateUtils::formatDateDB( $dateFrom );
		$dateToStr   = is_string( $dateTo )   ? $dateTo   : DateUtils::formatDateDB( $dateTo );

		$rows = $wpdb->get_results(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL
				"SELECT * FROM {$this->getTableName()}"
					. ' WHERE room_type_id = %d AND `date` BETWEEN %s AND %s',
				$roomTypeId,
				$dateFromStr,
				$dateToStr
			),
			ARRAY_A
		);

		return $this->mapToRules( $rows );
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function getTableName(): string {
		global $wpdb;

		return $wpdb->prefix . self::TABLE_CUSTOM_BOOKING_RULES;
	}

	public function hasBufferDaysRules(): bool {
		return $this->hasRules( 'buffer_days' );
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function hasRules( string $ruleType ): bool {
		global $wpdb;

		if ( $ruleType === 'check_in_days' ) {
			$ruleType = 'allow_check_in';
		} elseif ( $ruleType === 'check_out_days' ) {
			$ruleType = 'allow_check_out';
		}

		// phpcs:ignore WordPress.DB.PreparedSQL
		$sql = "SELECT 1 FROM {$this->getTableName()} WHERE {$ruleType} IS NOT NULL";

		return (bool) $wpdb->get_var( $sql );
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function removeRulesByRoomType( int $roomTypeId ): void {
		global $wpdb;

		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$this->getTableName()} WHERE room_type_id = %d",
				$roomTypeId
			)
		);
	}

	/**
	 * Automatically deletes rows with only NULLs.
	 *
	 * @param string[] $dates
	 * @return array <code>[ Date string ("Y-m-d") => Rules (array) ]</code>
	 *
	 * @global \wpdb $wpdb
	 */
	public function setRules( int $roomTypeId, array $dates, array $updateRules ): array {
		global $wpdb;

		$existingRules = $this->getRules( $roomTypeId, $dates );

		// Extend update data with the existing values
		$bookingRules = array();
		$deleteDates  = array(); // If everything becomes null

		foreach ( $dates as $date ) {
			$rules = $updateRules;

			if ( array_key_exists( $date, $existingRules ) ) {
				$rules += $existingRules[ $date ];
			}

			$rules += array(
				// For mapToRules()
				'room_type_id'            => $roomTypeId,
				'date'                    => $date,

				// Default values
				'allow_check_in'          => null,
				'allow_check_out'         => null,
				'buffer_days'             => null,
				'min_stay_length'         => null,
				'max_stay_length'         => null,
				'min_advance_reservation' => null,
				'max_advance_reservation' => null,
			);

			// Update or delete
			if ( $rules['allow_check_in'] === null
				&& $rules['allow_check_out'] === null
				&& $rules['buffer_days'] === null
				&& $rules['min_stay_length'] === null
				&& $rules['max_stay_length'] === null
				&& $rules['min_advance_reservation'] === null
				&& $rules['max_advance_reservation'] === null
			) {
				$deleteDates[] = $date;
			} else {
				$bookingRules[ $date ] = $rules;
			}
		}

		// Update booking rules
		if ( ! empty( $bookingRules ) ) {
			// phpcs:ignore WordPress.DB.PreparedSQL
			$sql = "REPLACE INTO {$this->getTableName()} (room_type_id, `date`,"
				. ' allow_check_in, allow_check_out, buffer_days, min_stay_length,'
				. ' max_stay_length, min_advance_reservation, max_advance_reservation)'
				. ' VALUES';

			$sortedColumns = array( 'allow_check_in', 'allow_check_out', 'buffer_days',
				'min_stay_length', 'max_stay_length', 'min_advance_reservation',
				'max_advance_reservation' );

			$placeholderData = array();

			foreach ( $bookingRules as $date => $rules ) {
				$placeholders = array( '%d', '%s');

				$placeholderData[] = $roomTypeId;
				$placeholderData[] = $date;

				foreach ( $sortedColumns as $column ) {
					if ( $rules[ $column ] !== null ) {
						$placeholders[] = '%d';
						$placeholderData[] = (int) $rules[ $column ];
					} else {
						$placeholders[] = 'NULL';
					}
				}

				$sql .= ' (' . implode( ', ', $placeholders ) . '),';
			}

			$sql = rtrim( $sql, ',' );

			$wpdb->query( $wpdb->prepare( $sql, $placeholderData ) );
		}

		// Delete empty booking rules
		if ( ! empty( $deleteDates ) ) {
			$this->deleteRules( $roomTypeId, $deleteDates );
		}

		return $this->mapToRules( $bookingRules );
	}

	/**
	 * @return array <code>[ Date string ("Y-m-d") => Rules (array) ]</code>
	 */
	private function mapToRules( array $rows ): array {
		$rules = array();

		foreach ( $rows as $row ) {
			$dateStr = $row['date'];
			$rule = array();

			foreach( $row as $column => $value ) {
				if ( is_null( $value ) ) {
					continue;
				}

				switch ( $column ) {
					case 'allow_check_in':
					case 'allow_check_out':
						$rule[ $column ] = (bool) $value;
						break;

					case 'buffer_days':
					case 'min_stay_length':
					case 'max_stay_length':
					case 'min_advance_reservation':
					case 'max_advance_reservation':
						$rule[ $column ] = (int) $value;
						break;
				}
			}

			if ( ! empty( $rule ) ) {
				$rules[ $dateStr ] = $rule;
			}
		}

		return $rules;
	}
}
