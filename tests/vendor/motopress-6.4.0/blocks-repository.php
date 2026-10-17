<?php

declare(strict_types=1);

namespace MPHB\Repositories;

use MPHB\Utils\DateUtils;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class BlocksRepository {
	private const TABLE_BLOCKS = 'mphb_blocks';

	private const COMMENT_MAX_LENGTH = 250;
	private const ITEMS_PER_PAGE     = 20;

	/**
	 * @global \wpdb $wpdb
	 */
	public function createTable(): void {
		global $wpdb;

		$wpdb->query(
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL
			"CREATE TABLE IF NOT EXISTS {$this->getTableName()} ("
				. ' block_id INT UNSIGNED NOT NULL AUTO_INCREMENT,'
				. ' room_type_id INT UNSIGNED NOT NULL,'
				. ' room_id INT UNSIGNED NOT NULL,'

				. ' date_from DATE NOT NULL,'
				. ' date_to DATE NOT NULL,'

				. ' not_check_in BOOLEAN NOT NULL DEFAULT 0,'
				. ' not_check_out BOOLEAN NOT NULL DEFAULT 0,'
				. ' not_stay_in BOOLEAN NOT NULL DEFAULT 0,'

				. ' comment VARCHAR(' . self::COMMENT_MAX_LENGTH . ') NOT NULL DEFAULT "",'

				. ' PRIMARY KEY (block_id)'
				. ' ) CHARSET=utf8'
		);
	}

	/**
	 * @param array $queryArgs {
	 *     The parameters are the same as for the queryItems() function.
	 *
	 *     @type int[]    $include      Block IDs to limit result set.
	 *     @type array    $orderby      <code>[ Column name => "ASC"|"DESC" ]</code>
	 *     @type int      $page         The page number.
	 *     @type int      $per_page     -1 or 1+. 20 by default.
	 *     @type string[] $restrictions "check-in"|"check-out"|"stay-in"
	 *     @type int      $room_type_id
	 * }
	 * @return array Counts the total number of items for current query.
	 *
	 * @global \wpdb $wpdb
	 */
	public function countItems( array $queryArgs ): int {
		global $wpdb;

		// "Disable" pagination
		$queryArgs['page'] = 1;
		$queryArgs['per_page'] = -1;

		$preparedSql = $this->buildQuerySql( $queryArgs );
		$preparedSql = str_replace( 'SELECT * FROM', 'SELECT COUNT(*) FROM', $preparedSql );

		// phpcs:ignore WordPress.DB.PreparedSQL
		$rowsCount = (int) $wpdb->get_var( $preparedSql );

		return $rowsCount;
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function deleteAll(): bool {
		global $wpdb;

		return (bool) $wpdb->query( "TRUNCATE TABLE {$this->getTableName()}" );
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function deleteAllByRoom( int $roomId ): bool {
		global $wpdb;

		return (bool) $wpdb->query(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL
				"DELETE FROM {$this->getTableName()} WHERE room_id = %d",
				$roomId
			)
		);
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function deleteAllByRoomType( int $roomTypeId ): bool {
		global $wpdb;

		return (bool) $wpdb->query(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL
				"DELETE FROM {$this->getTableName()} WHERE room_type_id = %d",
				$roomTypeId
			)
		);
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function deleteItem( int $blockId ): bool {
		global $wpdb;

		return (bool) $wpdb->delete(
			$this->getTableName(),
			array( 'block_id' => $blockId ),
			'%d'
		);
	}

	/**
	 * @param int[] $blockIds
	 *
	 * @global \wpdb $wpdb
	 */
	public function deleteItems( array $blockIds ): bool {
		global $wpdb;

		$idsPlaceholder = array_fill( 0, count( $blockIds ), '%d' );
		$idsPlaceholder = implode( ', ', $idsPlaceholder );

		return (bool) $wpdb->query(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL
				"DELETE FROM {$this->getTableName()} WHERE block_id IN ({$idsPlaceholder})",
				$blockIds
			)
		);
	}

	/**
	 * @return array <code>[ Block ID => Block data ]</code>
	 *
	 * @global \wpdb $wpdb
	 */
	public function getAll(): array {
		global $wpdb;

		// phpcs:ignore WordPress.DB.PreparedSQL
		$rows = $wpdb->get_results( "SELECT * FROM {$this->getTableName()}", ARRAY_A );

		return $this->mapToBlocks( $rows );
	}

	public function getDefaultItemsPerPage(): int {
		return self::ITEMS_PER_PAGE;
	}

	/**
	 * @return array|null Block data or null.
	 *
	 * @global \wpdb $wpdb
	 */
	public function getItem( int $blockId ): ?array {
		global $wpdb;

		$rows = $wpdb->get_results(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL
				"SELECT * FROM {$this->getTableName()} WHERE block_id = %d",
				$blockId
			),
			ARRAY_A
		);

		if ( ! empty( $rows ) ) {
			$blocks = $this->mapToBlocks( $rows );

			return reset( $blocks );
		} else {
			return null;
		}
	}

	/**
	 * @return array<int, array> <code>[ Block ID => Block data ]</code>.
	 */
	public function getItems( array $blockIds ): array {
		return $this->queryItems(
			array(
				'include'  => $blockIds,
				'per_page' => -1,
			)
		);
	}

	/**
	 * @param int $roomTypeId Room type ID or 0 (all room types).
	 * @param string|\DateTime $dateFrom
	 * @param string|\DateTime $dateTo
	 * @return array <code>[ Block ID => Block data ]</code>
	 *
	 * @global \wpdb $wpdb
	 */
	public function getItemsForPeriod( int $roomTypeId, $dateFrom, $dateTo ): array {
		global $wpdb;

		$dateFromStr = is_string( $dateFrom ) ? $dateFrom : DateUtils::formatDateDB( $dateFrom );
		$dateToStr   = is_string( $dateTo ) ? $dateTo : DateUtils::formatDateDB( $dateTo );

		$preparedSql = $wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL
			"SELECT * FROM {$this->getTableName()} WHERE date_from <= %s AND date_to >= %s",
			$dateToStr,
			$dateFromStr
		);

		if ( $roomTypeId !== 0 ) {
			$preparedSql .= $wpdb->prepare(
				' AND (room_type_id = 0 OR room_type_id = %d)',
				$roomTypeId
			);
		}

		// phpcs:ignore WordPress.DB.PreparedSQL
		$rows = $wpdb->get_results( $preparedSql, ARRAY_A );

		return $this->mapToBlocks( $rows );
	}

	/**
	 * Used for export.
	 *
	 * @param int $roomTypeId Room type ID or 0 (all room types).
	 * @param int $roomId Room ID or 0 (any room).
	 * @return array <code>[
	 *     [
	 *         date_from => string,
	 *         date_to   => string,
	 *         comment   => string,
	 *     ]
	 * ]</code>
	 *
	 * @global \wpdb $wpdb
	 */
	public function getNoStayPeriodsForRoom( int $roomTypeId, int $roomId ): array {
		global $wpdb;

		$preparedSql = "SELECT date_from, date_to, comment FROM {$this->getTableName()}"
			. ' WHERE not_stay_in = 1';

		if ( $roomTypeId !== 0 ) {
			$preparedSql .= $wpdb->prepare(
				' AND (room_type_id = 0 OR room_type_id = %d)',
				$roomTypeId
			);
		}

		if ( $roomId !== 0 ) {
			$preparedSql .= $wpdb->prepare(
				' AND (room_id = 0 OR room_id = %d)',
				$roomId
			);
		}

		// phpcs:ignore WordPress.DB.PreparedSQL
		return $wpdb->get_results( $preparedSql, ARRAY_A );
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function getTableName(): string {
		global $wpdb;

		return $wpdb->prefix . self::TABLE_BLOCKS;
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function getTotalCount(): int {
		global $wpdb;

		$sql = "SELECT COUNT(*) FROM {$this->getTableName()}";

		// phpcs:ignore WordPress.DB.PreparedSQL
		$totalCount = $wpdb->get_var( $sql );

		return absint( $totalCount );
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function hasNotCheckInRules(): bool {
		global $wpdb;

		$sql = "SELECT 1 FROM {$this->getTableName()} WHERE not_check_in != 0";

		// phpcs:ignore WordPress.DB.PreparedSQL
		return (bool) $wpdb->get_var( $sql );
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function hasNotCheckOutRules(): bool {
		global $wpdb;

		$sql = "SELECT 1 FROM {$this->getTableName()} WHERE not_check_out != 0";

		// phpcs:ignore WordPress.DB.PreparedSQL
		return (bool) $wpdb->get_var( $sql );
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function hasNotStayInRules(): bool {
		global $wpdb;

		$sql = "SELECT 1 FROM {$this->getTableName()} WHERE not_stay_in != 0";

		// phpcs:ignore WordPress.DB.PreparedSQL
		return (bool) $wpdb->get_var( $sql );
	}

	/**
	 * @return int|false Block ID or false.
	 *
	 * @global \wpdb $wpdb
	 */
	public function insertItem( array &$item ) {
		global $wpdb;

		$isInserted = (bool) $wpdb->insert(
			$this->getTableName(),
			array(
				'room_type_id'  => $item['room_type_id'],
				'room_id'       => $item['room_id'],
				'date_from'     => $item['date_from'],
				'date_to'       => $item['date_to'],
				'not_check_in'  => (int) $item['not_check_in'],
				'not_check_out' => (int) $item['not_check_out'],
				'not_stay_in'   => (int) $item['not_stay_in'],
				'comment'       => $this->sanitizeComment( $item['comment'] ),
			),
			array( '%d', '%d', '%s', '%s', '%d', '%d', '%d', '%s' )
		);

		if ( ! $isInserted ) {
			return false;
		}

		// phpcs:ignore WordPress.DB.PreparedSQL
		$blockId = $wpdb->get_var( "SELECT block_id FROM {$this->getTableName()} ORDER BY block_id DESC LIMIT 1" );
		$blockId = absint( $blockId );

		$item['block_id'] = $blockId;

		return $blockId;
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function insertItems( array $items ): void {
		global $wpdb;

		if ( empty( $items ) ) {
			return;
		}

		$insertBatchSql = "INSERT INTO {$this->getTableName()} (room_type_id,"
			. ' room_id, date_from, date_to, not_check_in, not_check_out,'
			. ' not_stay_in, comment) VALUES';

		foreach ( $items as $item ) {
			$insertBatchSql .= $wpdb->prepare(
				' (%d, %d, %s, %s, %d, %d, %d, %s),',
				$item['room_type_id'],
				$item['room_id'],
				$item['date_from'],
				$item['date_to'],
				(int) $item['not_check_in'],
				(int) $item['not_check_out'],
				(int) $item['not_stay_in'],
				$this->sanitizeComment( $item['comment'] )
			);
		}

		$insertBatchSql = rtrim( $insertBatchSql, ',' );

		// phpcs:ignore WordPress.DB.PreparedSQL
		$wpdb->query( $insertBatchSql );
	}

	/**
	 * Use <code>countItems()</code> to get the total number of items for the
	 * query.
	 *
	 * @param array $queryArgs {
	 *     @type int[]    $include      Block IDs to limit result set.
	 *     @type array    $orderby      <code>[ Column name => "ASC"|"DESC" ]</code>
	 *     @type int      $page         The page number.
	 *     @type int      $per_page     -1 or 1+. 20 by default.
	 *     @type string[] $restrictions "check-in"|"check-out"|"stay-in"
	 *     @type int      $room_type_id
	 * }
	 * @return array<int, array> <code>[ Block ID => Block data ]</code>.
	 *
	 * @global \wpdb $wpdb
	 */
	public function queryItems( array $queryArgs ): array {
		global $wpdb;

		// phpcs:ignore WordPress.DB.PreparedSQL
		$rows = $wpdb->get_results( $this->buildQuerySql( $queryArgs ), ARRAY_A );

		return $this->mapToBlocks( $rows );
	}

	/**
	 * @global \wpdb $wpdb
	 */
	public function updateItem( array $item ): bool {
		global $wpdb;

		/** @var int|false $updated 1, 0 (nothing changed) or false. */
		$updated = $wpdb->update(
			$this->getTableName(),
			array(
				'room_type_id'  => $item['room_type_id'],
				'room_id'       => $item['room_id'],
				'date_from'     => $item['date_from'],
				'date_to'       => $item['date_to'],
				'not_check_in'  => (int) $item['not_check_in'],
				'not_check_out' => (int) $item['not_check_out'],
				'not_stay_in'   => (int) $item['not_stay_in'],
				'comment'       => $this->sanitizeComment( $item['comment'] ),
			),
			array( 'block_id' => $item['block_id'] ),
			array( '%d', '%d', '%s', '%s', '%d', '%d', '%d', '%s' ),
			'%d'
		);

		return $updated !== false;
	}

	/**
	 * @param array $queryArgs {
	 *     @type int[]    $include      Block IDs to limit result set.
	 *     @type array    $orderby      <code>[ Column name => "ASC"|"DESC" ]</code>
	 *     @type int      $page         The page number.
	 *     @type int      $per_page     -1 or 1+. 20 by default.
	 *     @type string[] $restrictions "check-in"|"check-out"|"stay-in"
	 *     @type int      $room_type_id
	 * }
	 *
	 * @global \wpdb $wpdb
	 */
	private function buildQuerySql( array $queryArgs ): string {
		global $wpdb;

		// Add default values
		$queryArgs += array(
			'orderby'  => array( 'block_id' => 'ASC' ),
			'page'     => 1,
			'per_page' => $this->getDefaultItemsPerPage(),
		);

		// countItems() changes this part to "SELECT COUNT(*)"
		$preparedSql = "SELECT * FROM {$this->getTableName()}";

		// Build WHERE SQL
		$preparedSql .= ' WHERE 1';

		if ( ! empty( $queryArgs['include'] ) ) {
			$idsPlaceholder = array_fill( 0, count( $queryArgs['include'] ), '%d' );
			$idsPlaceholder = implode( ', ', $idsPlaceholder );

			$preparedSql .= $wpdb->prepare(
				" AND block_id IN ({$idsPlaceholder})", // phpcs:ignore
				$queryArgs['include']
			);
		}

		if ( ! empty( $queryArgs['restrictions'] ) ) {
			if ( in_array( 'check-in', $queryArgs['restrictions'] ) ) {
				$preparedSql .= ' AND not_check_in = 1';
			}

			if ( in_array( 'check-out', $queryArgs['restrictions'] ) ) {
				$preparedSql .= ' AND not_check_out = 1';
			}

			if ( in_array( 'stay-in', $queryArgs['restrictions'] ) ) {
				$preparedSql .= ' AND not_stay_in = 1';
			}
		}

		if ( isset( $queryArgs['room_type_id'] ) && $queryArgs['room_type_id'] !== 0 ) {
			$preparedSql .= $wpdb->prepare(
				' AND (room_type_id = 0 OR room_type_id = %d)',
				$queryArgs['room_type_id']
			);
		}

		// Build ORDER BY SQL
		$orderBys = array();

		foreach ( $queryArgs['orderby'] as $column => $order ) {
			if ( $column === 'ID' ) {
				$column = 'block_id';
			} elseif ( $column === 'date' ) {
				$column = 'date_from';
			}

			$orderBys[] = $column . ' ' . strtoupper( $order );
		}

		if ( ! empty( $orderBys ) ) {
			$preparedSql .= ' ORDER BY ' . implode( ', ', $orderBys );
		}

		// Build LIMIT SQL
		if ( $queryArgs['per_page'] > 0 ) {
			$itemsOffset = ( $queryArgs['page'] - 1 ) * $queryArgs['per_page'];

			$preparedSql .= $wpdb->prepare( " LIMIT %d, %d", $itemsOffset, $queryArgs['per_page'] );
		}

		return $preparedSql;
	}

	/**
	 * When changing the field list, it is also worth updating the following
	 * methods:
	 * - ApiHelper::prepareCustomBookingRuleResponse()
	 * - ValidateUtils::convertCustomBookingRulesToBlocks()
	 *
	 * @return array <code>[ Block ID => Block data ]</code>
	 */
	private function mapToBlocks( array $rows ): array {
		$blocks = array();

		foreach ( $rows as $row ) {
			$blockId = absint( $row['block_id'] );

			$notCheckIn  = (bool) $row['not_check_in'];
			$notCheckOut = (bool) $row['not_check_out'];
			$notStayIn   = (bool) $row['not_stay_in'];

			$blocks[ $blockId ] = array(
				'block_id'         => $blockId,
				'comment'          => $row['comment'],
				'date_from'        => $row['date_from'],
				'date_to'          => $row['date_to'],
				'has_restrictions' => $notCheckIn || $notCheckOut || $notStayIn,
				'not_check_in'     => $notCheckIn,
				'not_check_out'    => $notCheckOut,
				'not_stay_in'      => $notStayIn,
				'room_id'          => absint( $row['room_id'] ),
				'room_type_id'     => absint( $row['room_type_id'] ),
			);
		}

		return $blocks;
	}

	private function sanitizeComment( string $comment ): string {
		if ( strlen( $comment ) > self::COMMENT_MAX_LENGTH ) {
			$comment = substr( $comment, 0, self::COMMENT_MAX_LENGTH );
		}

		return $comment;
	}
}
