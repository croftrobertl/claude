<?php

namespace MPHB\Core;

use MPHB\Utils\DateUtils;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Data transfer object for booking rules.
 */
class BookingRulesData {

	/**
	 * @var array [ season_id (int) => Entities\Season, ... ]
	 */
	private $seasons;

	/**
	 * @var int
	 */
	private $countOfAllRoomTypeOriginalIds;

	/**
	 * @var array [
	 *     room_type_original_id (int if 0 then rules for all room types) => [
	 *         'check_in_days'           => [ [ 'season_id' => int (if 0 then rule for all seasons), 'rule_value' => int[] (week days numbers 0 - 6) ], ... ],
	 *         'check_out_days'          => [ [ 'season_id' => int (if 0 then rule for all seasons), 'rule_value' => int[] (week days numbers 0 - 6) ], ... ],
	 *         'min_advance_reservation' => [ [ 'season_id' => int (if 0 then rule for all seasons), 'rule_value' => int ], ... ],
	 *         'max_advance_reservation' => [ [ 'season_id' => int (if 0 then rule for all seasons), 'rule_value' => int ], ... ],
	 *         'min_stay_length'         => [ [ 'season_id' => int (if 0 then rule for all seasons), 'rule_value' => int ], ... ],
	 *         'max_stay_length'         => [ [ 'season_id' => int (if 0 then rule for all seasons), 'rule_value' => int ], ... ],
	 *         'buffer_days'             => [ [ 'season_id' => int (if 0 then rule for all seasons), 'rule_value' => int ], ... ],
	 *     ],
	 *     ...
	 * ]
	 */
	private $reservationRulesByRoomTypeIds = array();

	/**
	 * @var array [
	 *     [
	 *         'room_type_id'        => int,
	 *         'room_id'             => $roomId,
	 *         'date_from'           => string (Ymd),
	 *         'date_to'             => string (Ymd),
	 *         'date_period'         => DatePeriod,
	 *         'not_check_in'        => bool,
	 *         'not_check_out'       => bool,
	 *         'not_stay_in'         => bool,
	 *         'custom_rule_comment' => string
	 *     ],
	 *     ...
	 * ]
	 */
	private $customRules = array();

	private array $hasReservationRules = array(
		'check_in_days'           => false,
		'check_out_days'          => false,
		'min_stay_length'         => false,
		'max_stay_length'         => false,
		'min_advance_reservation' => false,
		'max_advance_reservation' => false,
		'buffer_days'             => false,
	);

	private ?bool $hasNotCheckInRules  = null;
	private ?bool $hasNotCheckOutRules = null;
	private ?bool $hasNotStayInRules   = null;

	/**
	 * @var array [
	 *     date (string Ymd) => [
	 *         room_type_original_id (int) => [
	 *             'check_in_days'            => int[] (week days numbers 0 - 6),
	 *             'check_out_days'           => int[] (week days numbers 0 - 6),
	 *             'min_advance_reservation'  => int,
	 *             'max_advance_reservation'  => int,
	 *             'min_stay_length'          => int,
	 *             'max_stay_length'          => int,
	 *             'buffer_days'              => int,
	 *             'not_check_in'             => bool,
	 *             'not_check_out'            => bool,
	 *             'not_stay_in'              => bool,
	 *             'custom_rule_comment'      => string,
	 *             'custom_rules_for_room_id' => [
	 *                 room_id (int) => [
	 *                     'not_check_in'        => bool,
	 *                     'not_check_out'       => bool,
	 *                     'not_stay_in'         => bool,
	 *                     'custom_rule_comment' => string,
	 *                 ],
	 *                 ...
	 *             ]
	 *         ],
	 *         ...
	 *     ],
	 *     ...
	 * ]
	 */
	private $cachedRulesByDates = array();

	/**
	 * See <code>getBlocksForMonth()</code>.
	 *
	 * @var array <code>[ Block ID => [ room_type_id, room_id, ... ] ]</code>
	 */
	private array $loadedBlocks = array();

	/**
	 * New items are added with each new month's load. See
	 * <code>getBlocksByDate()</code>.
	 *
	 * @var array <code>[
	 *     Room type ID (int) => [
	 *         Date string ("Y-m-d") => [
	 *             Block ID => [ room_type_id, room_id, ... ]
	 *         ]
	 *     ]
	 * ]</code>
	 */
	private array $blocksByDate = array();

	/**
	 * @var array <code>[
	 *     Room type ID => [
	 *         Month => [
	 *             Date string ("Y-m-d") => [ buffer_days, check_in_days, ... ]
	 *         ]
	 *     ]
	 * ]</code>
	 */
	private array $cachedCustomBookingRules = array();

	/**
	 * @var array <code>[ Original room type ID|0 => Max buffer days count (int) ]</code>
	 */
	private array $cachedMaxBufferDaysCounts = array();

	public function __construct() {

		/**
		 * [
		 *	   'check_in_days'           => [ [ 'season_ids' => int[], 'room_type_ids' => int[], 'check_in_days' => int[] (week day numbers: 0..6) ], ... ],
		 *	   'check_out_days'          => [ [ 'season_ids' => int[], 'room_type_ids' => int[], 'check_out_days' => int[] (week day numbers: 0..6) ], ... ],
		 *	   'min_stay_length'         => [ [ 'season_ids' => int[], 'room_type_ids' => int[], 'min_stay_length' => int ], ... ],
		 *	   'max_stay_length'         => [ [ 'season_ids' => int[], 'room_type_ids' => int[], 'max_stay_length' => int ], ... ],
		 *	   'min_advance_reservation' => [ [ 'season_ids' => int[], 'room_type_ids' => int[], 'min_advance_reservation' => int ], ... ],
		 *	   'max_advance_reservation' => [ [ 'season_ids' => int[], 'room_type_ids' => int[], 'max_advance_reservation' => int ], ... ]
		 * ]
		 */
		$reservationRules = MPHB()->settings()->bookingRules()->getReservationRules();

		/**
		 * [ [ 'season_ids' => int[], 'room_type_ids' => int[], 'buffer_days' => int ], ... ]
		 */
		$reservationRules['buffer_days'] = MPHB()->settings()->bookingRules()->getBufferRules();

		$allRoomTypeOriginalIds = mphb_rooms_facade()->getAllRoomTypeOriginalIds();
		$this->countOfAllRoomTypeOriginalIds = count( $allRoomTypeOriginalIds );

		$seasons       = MPHB()->getSeasonRepository()->findAll();
		$this->seasons = array();

		foreach ( $seasons as $season ) {

			$this->seasons[ $season->getId() ] = $season;
		}

		foreach ( $reservationRules as $ruleType => $ruleDatas ) {

			foreach ( $ruleDatas as $ruleData ) {

				$ruleValue = null;
				$isRuleValueValid = false;

				if ( 'buffer_days' === $ruleType ||
					'min_stay_length' === $ruleType || 'max_stay_length' === $ruleType ||
					'min_advance_reservation' === $ruleType || 'max_advance_reservation' === $ruleType
				) {

					$ruleValue = absint( $ruleData[ $ruleType ] );
					$isRuleValueValid = 0 < $ruleValue;

				} elseif ( 'check_in_days' === $ruleType || 'check_out_days' === $ruleType ) {

					$ruleValue = $ruleData[ $ruleType ];
					$isRuleValueValid = is_array( $ruleValue ) && 0 < count( $ruleValue );
				}

				if ( ! empty( $ruleData['room_type_ids'] ) && is_array( $ruleData['room_type_ids'] ) &&
					! empty( $ruleData['season_ids'] ) && is_array( $ruleData['season_ids'] ) &&
					$isRuleValueValid
				) {

					$this->hasReservationRules[ $ruleType ] = true;

					$ruleSeasons = $ruleData['season_ids'];

					// if season_ids contains 0 then rule is for all seasons
					if ( in_array( 0, $ruleSeasons ) ) {

						// we keep copy of ruleas for all seasons ( where season_id = 0 ) to be able to find common rules
						$ruleSeasons = array( 0 );
					}

					$ruleRoomTypeIds = $ruleData['room_type_ids'];

					// if $ruleData['room_type_ids'] contains 0 then rule is for all room types
					if ( in_array( 0, $ruleRoomTypeIds ) ) {

						$ruleRoomTypeIds = $allRoomTypeOriginalIds;
					}

					foreach ( $ruleSeasons as $seasonId ) {

						// we expect original room type ids on base language!
						foreach ( $ruleRoomTypeIds as $roomTypeOriginalId ) {

							// we keep all rules in set order because top rules have bigger priority than bottoms
							$this->reservationRulesByRoomTypeIds[ $roomTypeOriginalId ][ $ruleType ][] = array(
								'season_id'  => $seasonId,
								'rule_value' => $ruleValue,
							);
						}
					}
				}
			}
		}

		// Check for existance of custom rules
		foreach ( $this->hasReservationRules as $ruleType => $rulesExist ) {
			if ( ! $rulesExist ) {
				$this->hasReservationRules[ $ruleType ] = MPHB()->getCustomBookingRulesRepository()->hasRules( $ruleType );
			}
		}
	}

	/**
	 * @return array [ 'check_in_days'            => int[] (week days numbers 0 - 6),
	 *                 'check_out_days'           => int[] (week days numbers 0 - 6),
	 *                 'min_advance_reservation'  => int,
	 *                 'max_advance_reservation'  => int,
	 *                 'min_stay_length'          => int,
	 *                 'max_stay_length'          => int,
	 *                 'buffer_days'              => int,
	 *                 'not_check_in'             => bool,
	 *                 'not_check_out'            => bool,
	 *                 'not_stay_in'              => bool,
	 *                 'custom_rule_comment'      => string,
	 *                 'custom_rules_for_room_id' => [
	 *                    room_id (int) => [
	 *                       'not_check_in'        => bool,
	 *                       'not_check_out'       => bool,
	 *                       'not_stay_in'         => bool,
	 *                       'custom_rule_comment' => string,
	 *                    ], ...
	 *                 ]
	 *               ]
	 */
	private function getBookingRulesForDate( int $roomTypeOriginalId, \DateTime $requestedDate ) {

		$requestedDateString = $requestedDate->format('Ymd');

		if ( ! isset( $this->cachedRulesByDates[ $requestedDateString ][ $roomTypeOriginalId ] ) ) {

			$result = array();

			if ( 0 === $roomTypeOriginalId ) {

				// find common reservation rules for not found rule types
				// if requested $roomTypeOriginalId = 0 (for example, for search form)
				$collectingRules = array();

				foreach ( $this->reservationRulesByRoomTypeIds as $roomTypeId => $rulesByTypes ) {

					foreach ( $rulesByTypes as $ruleType => $ruleDatas ) {

						if ( ! isset( $collectingRules[ $ruleType ]['room_type_ids'] ) ) {

							$collectingRules[ $ruleType ]['room_type_ids']     = array();
							$collectingRules[ $ruleType ]['common_rule_value'] = null;
						}

						if ( empty( $result[ $ruleType ] ) &&
							'buffer_days' !== $ruleType &&
							! in_array( $roomTypeId, $collectingRules[ $ruleType ]['room_type_ids'] )
						) {

							foreach ( $ruleDatas as $seasonRuleData ) {

								$season = isset( $this->seasons[ $seasonRuleData['season_id'] ] ) ? $this->seasons[ $seasonRuleData['season_id'] ] : null;

								if ( 0 === $seasonRuleData['season_id'] ||
									( null !== $season && $season->isDateInSeason( $requestedDate ) )
								) {

									if ( ( 'min_stay_length' === $ruleType || 'min_advance_reservation' === $ruleType ) &&
										( null === $collectingRules[ $ruleType ]['common_rule_value'] ||
											$collectingRules[ $ruleType ]['common_rule_value'] > $seasonRuleData['rule_value'] )
									) {

										// searching min rule value as common rule value
										$collectingRules[ $ruleType ]['common_rule_value'] = $seasonRuleData['rule_value'];

									} elseif ( ( 'max_stay_length' === $ruleType || 'max_advance_reservation' === $ruleType ) &&
										( null === $collectingRules[ $ruleType ]['common_rule_value'] ||
										$collectingRules[ $ruleType ]['common_rule_value'] < $seasonRuleData['rule_value'] )
									) {

										// searching max rule value as common rule value
										$collectingRules[ $ruleType ]['common_rule_value'] = $seasonRuleData['rule_value'];

									} elseif ( 'check_in_days' === $ruleType || 'check_out_days' === $ruleType ) {

										if ( null === $collectingRules[ $ruleType ]['common_rule_value'] ) {

											$collectingRules[ $ruleType ]['common_rule_value'] = array();
										}

										$collectingRules[ $ruleType ]['common_rule_value'] = array_merge(
											$collectingRules[ $ruleType ]['common_rule_value'],
											$seasonRuleData['rule_value']
										);
									}

									$collectingRules[ $ruleType ]['room_type_ids'][] = $roomTypeId;

									if ( 0 === $roomTypeId || $this->countOfAllRoomTypeOriginalIds === count( $collectingRules[ $ruleType ]['room_type_ids'] ) ) {

										if ( 'check_in_days' === $ruleType || 'check_out_days' === $ruleType ) {

											$collectingRules[ $ruleType ]['common_rule_value'] = array_unique( $collectingRules[ $ruleType ]['common_rule_value'] );
										}

										$result[ $ruleType ] = $collectingRules[ $ruleType ]['common_rule_value'];
									}

									// we collect only first suitable rule value for each roomTypeId
									break;
								}
							}
						}
					}
				}

			} elseif ( isset( $this->reservationRulesByRoomTypeIds[ $roomTypeOriginalId ] ) ) {

				// find reservation rules data for certain room type id
				foreach ( $this->reservationRulesByRoomTypeIds[ $roomTypeOriginalId ] as $ruleType => $ruleData ) {

					foreach ( $ruleData as $seasonRuleData ) {

						$season = isset( $this->seasons[ $seasonRuleData['season_id'] ] ) ? $this->seasons[ $seasonRuleData['season_id'] ] : null;

						if ( 0 === $seasonRuleData['season_id'] ||
							( null !== $season && $season->isDateInSeason( $requestedDate ) )
						) {

							$result[ $ruleType ] = $seasonRuleData['rule_value'];
							break;
						}
					}
				}
			}

			// Find blocks data for requested date
			$blocksByDate = $this->getBlocksByDate( $roomTypeOriginalId, $requestedDate );
			$notCheckInRoomsCount = 0;
			$notCheckOutRoomsCount = 0;
			$notStayInRoomsCount = 0;

			foreach ( $blocksByDate as $block ) {
				$roomId      = $block['room_id'];
				$roomTypeId  = $block['room_type_id'];
				$comment     = $block['comment'];

				if (
					$roomTypeId !== 0
					&& $roomTypeOriginalId > 0
					&& $roomTypeId != $roomTypeOriginalId
				) {
					continue;
				}

				if ( $roomId > 0 ) {
					if ( ! isset( $result['custom_rules_for_room_id'][ $roomId ] ) ) {
						$result['custom_rules_for_room_id'][ $roomId ] = array(
							'custom_rule_comment' => '',
							'not_check_in'        => false,
							'not_check_out'       => false,
							'not_stay_in'         => false,
						);
					}

					if ( $block['not_check_in'] ) {
						$result['custom_rules_for_room_id'][ $roomId ]['not_check_in'] = true;
						$notCheckInRoomsCount++;
					}

					if ( $block['not_check_out'] ) {
						$result['custom_rules_for_room_id'][ $roomId ]['not_check_out'] = true;
						$notCheckOutRoomsCount++;
					}

					if ( $block['not_stay_in'] ) {
						$result['custom_rules_for_room_id'][ $roomId ]['not_stay_in'] = true;
						$notStayInRoomsCount++;
					}

					if ( $comment !== '' ) {
						if ( empty( $result['custom_rules_for_room_id'][ $roomId ]['custom_rule_comment'] ) ) {
							$result['custom_rules_for_room_id'][ $roomId ]['custom_rule_comment'] = $comment;
						} else {
							$result['custom_rules_for_room_id'][ $roomId ]['custom_rule_comment'] .= ', ' . $comment;
						}
					}

				} else if ( $roomTypeId > 0 ) {

					$rooms = MPHB()->getRoomPersistence()->findAllIdsByType( $roomTypeId );

					foreach( $rooms as $roomId) {
						if ( ! isset( $result['custom_rules_for_room_id'][ $roomId ] ) ) {
							$result['custom_rules_for_room_id'][ $roomId ] = array(
								'custom_rule_comment' => '',
								'not_check_in'        => false,
								'not_check_out'       => false,
								'not_stay_in'         => false,
							);
						}

						if ( $block['not_check_in'] ) {
							$result['custom_rules_for_room_id'][ $roomId ]['not_check_in'] = true;
							$notCheckInRoomsCount++;
						}

						if ( $block['not_check_out'] ) {
							$result['custom_rules_for_room_id'][ $roomId ]['not_check_out'] = true;
							$notCheckOutRoomsCount++;
						}

						if ( $block['not_stay_in'] ) {
							$result['custom_rules_for_room_id'][ $roomId ]['not_stay_in'] = true;
							$notStayInRoomsCount++;
						}

						if ( $comment !== '' ) {
							if ( empty( $result['custom_rules_for_room_id'][ $roomId ]['custom_rule_comment'] ) ) {
								$result['custom_rules_for_room_id'][ $roomId ]['custom_rule_comment'] = $comment;
							} else {
								$result['custom_rules_for_room_id'][ $roomId ]['custom_rule_comment'] .= ', ' . $comment;
							}
						}
					}
				} else {
					if ( $block['not_check_in'] ) {
						$result['not_check_in'] = true;
					}

					if ( $block['not_check_out'] ) {
						$result['not_check_out'] = true;
					}

					if ( $block['not_stay_in'] ) {
						$result['not_stay_in'] = true;
					}

					if ( $comment !== '' ) {
						if ( empty( $result['custom_rule_comment'] ) ) {
							$result['custom_rule_comment'] = $comment;
						} else {
							$result['custom_rule_comment'] .= ', ' . $comment;
						}
					}
				}
			}

			$allRoomsCount = 0;

			if ( 0 === $roomTypeOriginalId ) {
				$allRoomsCount = MPHB()->getRoomPersistence()->getCount();
			} elseif ( 0 < $roomTypeOriginalId ) {
				$allRoomsCount = count( MPHB()->getRoomPersistence()->findAllIdsByType( $roomTypeOriginalId ) );
			}

			$result['not_check_in']  = $result['not_check_in']  ?? $allRoomsCount <= $notCheckInRoomsCount;
			$result['not_check_out'] = $result['not_check_out'] ?? $allRoomsCount <= $notCheckOutRoomsCount;
			$result['not_stay_in']   = $result['not_stay_in']   ?? $allRoomsCount <= $notStayInRoomsCount;

			$result = array_merge(
				array(
					'check_in_days'            => array( 0, 1, 2, 3, 4, 5, 6 ),
					'in_check_in_days'         => true,
					'check_out_days'           => array( 0, 1, 2, 3, 4, 5, 6 ),
					'in_check_out_days'        => true,
					'min_advance_reservation'  => 0,
					'max_advance_reservation'  => 0,
					'min_stay_length'          => 1,
					'max_stay_length'          => 0,
					'buffer_days'              => 0,
					'not_check_in'             => false,
					'not_check_out'            => false,
					'not_stay_in'              => false,
					'custom_rule_comment'      => '',
					'custom_rules_for_room_id' => array(),
				),
				$result
			);

			$requestedDateWeekDay = (int) $requestedDate->format( 'w' );

			$result['in_check_in_days'] = in_array( $requestedDateWeekDay, $result['check_in_days'] );

			$result['in_check_out_days'] = in_array( $requestedDateWeekDay, $result['check_out_days'] );

			// Merge with custom booking rules
			$customBookingRules = $this->getCustomBookingRulesByDate( $roomTypeOriginalId, $requestedDate );

			foreach ( $customBookingRules as $ruleType => $value ) {
				switch ( $ruleType ) {
					case 'allow_check_in':
						$dayIndex = (int) $requestedDate->format( 'w' ); // 0-6

						if ( $value ) {
							mphb_array_add( $result['check_in_days'], $dayIndex );
						} else {
							mphb_array_remove( $result['check_in_days'], $dayIndex );
						}

						$result['in_check_in_days'] = $value;
						break;

					case 'allow_check_out':
						$dayIndex = (int) $requestedDate->format( 'w' ); // 0-6

						if ( $value ) {
							mphb_array_add( $result['check_out_days'], $dayIndex );
						} else {
							mphb_array_remove( $result['check_out_days'], $dayIndex );
						}

						$result['in_check_out_days'] = $value;
						break;

					default:
						$result[ $ruleType ] = $value;
						break;
				}
			}

			/**
			 * @since 4.10.0
			 *
			 * @param array $bookingRules
			 * @param int $roomTypeId
			 * @param \DateTime $date
			 */
			$result = apply_filters( 'mphb_get_booking_rules_for_date', $result, $roomTypeOriginalId, $requestedDate );

			$this->cachedRulesByDates[ $requestedDateString ][ $roomTypeOriginalId ] = $result;
		}

		return $this->cachedRulesByDates[ $requestedDateString ][ $roomTypeOriginalId ];
	}

	private static function getCheckInWithCorrectTimeInSiteTimeZone( \DateTime $checkInDate ): \DateTime {

		$checkInDateTime = clone $checkInDate;
		$checkInDateTime->setTimezone( DateUtils::getSiteTimeZone() );
		$checkInTime = MPHB()->settings()->dateTime()->getCheckInTime( true );
		$checkInDateTime->setTime( $checkInTime[0], $checkInTime[1], $checkInTime[2] );
		return $checkInDateTime;
	}

	private static function getCheckOutWithCorrectTimeInSiteTimeZone( \DateTime $checkOutDate ): \DateTime {

		$checkOutDateTime = clone $checkOutDate;
		$checkOutDateTime->setTimezone( DateUtils::getSiteTimeZone() );
		$checkOutTime = MPHB()->settings()->dateTime()->getCheckOutTime( true );
		$checkOutDateTime->setTime( $checkOutTime[0], $checkOutTime[1], $checkOutTime[2] );
		return $checkOutDateTime;
	}


	public function isCheckInEarlierThanMinAdvanceDate( int $roomTypeOriginalId, \DateTime $checkInDate, bool $isIgnoreBookingRules ) {

		$checkInDateTime = self::getCheckInWithCorrectTimeInSiteTimeZone( $checkInDate );

		return ! $isIgnoreBookingRules &&
			$this->hasMinAdvanceReservationRules() &&
			DateUtils::calcNightsSinceToday( $checkInDateTime ) < $this->getMinAdvanceReservationDaysCount(
				$roomTypeOriginalId,
				$checkInDateTime,
				$isIgnoreBookingRules
			);
	}


	public function getMinAdvanceReservationDaysCount( int $roomTypeOriginalId, \DateTime $requestedDate, bool $isIgnoreBookingRules ): int {

		$result = 0;

		if ( ! $isIgnoreBookingRules && $this->hasMinAdvanceReservationRules() ) {

			$checkInDateTime = self::getCheckInWithCorrectTimeInSiteTimeZone( $requestedDate );
			$bookingRules = $this->getBookingRulesForDate( $roomTypeOriginalId, $checkInDateTime );
			$result = $bookingRules['min_advance_reservation'];
		}

		return $result;
	}


	public function isCheckInLaterThanMaxAdvanceDate( int $roomTypeOriginalId, \DateTime $checkInDate, bool $isIgnoreBookingRules ) {

		$checkInDateTime = self::getCheckInWithCorrectTimeInSiteTimeZone( $checkInDate );

		$maxStayDaysCount = $this->getMaxAdvanceReservationDaysCount(
			$roomTypeOriginalId,
			$checkInDateTime,
			$isIgnoreBookingRules
		);

		return ! $isIgnoreBookingRules &&
			$this->hasMaxAdvanceReservationRules() &&
			0 < $maxStayDaysCount &&
			DateUtils::calcNightsSinceToday( $checkInDateTime ) > $maxStayDaysCount;
	}


	public function getMaxAdvanceReservationDaysCount( int $roomTypeOriginalId, \DateTime $requestedDate, bool $isIgnoreBookingRules ): int {

		$result = 0;

		if ( ! $isIgnoreBookingRules && $this->hasMaxAdvanceReservationRules() ) {

			$checkInDateTime = self::getCheckInWithCorrectTimeInSiteTimeZone( $requestedDate );
			$bookingRules = $this->getBookingRulesForDate( $roomTypeOriginalId, $checkInDateTime );
			$result = $bookingRules['max_advance_reservation'];
		}

		return $result;
	}


	public function getMinStayNightsCountForAllSeasons( int $roomTypeOriginalId ): int {

		$result = 1;

		if ( isset( $this->reservationRulesByRoomTypeIds[ $roomTypeOriginalId ]['min_stay_length'] ) ) {

			foreach ( $this->reservationRulesByRoomTypeIds[ $roomTypeOriginalId ]['min_stay_length'] as $ruleData ) {

				if ( 0 === $ruleData['season_id'] ) {

					$result = $ruleData['rule_value'];
					$isRuleFound = true;
					break;
				}
			}
		}

		return $result;
	}


	public function isMinStayNightsRuleViolated( int $roomTypeOriginalId, \DateTime $checkInDate, \DateTime $checkOutDate, bool $isIgnoreBookingRules ) {

		$checkInDateTime = self::getCheckInWithCorrectTimeInSiteTimeZone( $checkInDate );
		$checkOutDateTime = self::getCheckOutWithCorrectTimeInSiteTimeZone( $checkOutDate );

		return ! $isIgnoreBookingRules &&
			$this->hasMinStayLengthRules() &&
			DateUtils::calcNights( $checkInDateTime, $checkOutDateTime ) < $this->getMinStayNightsCount(
				$roomTypeOriginalId,
				$checkInDateTime,
				$isIgnoreBookingRules
			);
	}


	public function getMinStayNightsCount( int $roomTypeOriginalId, \DateTime $requestedDate, bool $isIgnoreBookingRules ): int {

		$result = 1;

		if ( ! $isIgnoreBookingRules && $this->hasMinStayLengthRules() ) {

			$checkInDateTime = self::getCheckInWithCorrectTimeInSiteTimeZone( $requestedDate );
			$bookingRules = $this->getBookingRulesForDate( $roomTypeOriginalId, $checkInDateTime );
			$result = $bookingRules['min_stay_length'];
		}

		return $result;
	}


	public function isMaxStayNightsRuleViolated( int $roomTypeOriginalId, \DateTime $checkInDate, \DateTime $checkOutDate, bool $isIgnoreBookingRules ) {

		$checkInDateTime = self::getCheckInWithCorrectTimeInSiteTimeZone( $checkInDate );
		$checkOutDateTime = self::getCheckOutWithCorrectTimeInSiteTimeZone( $checkOutDate );

		$maxStayDaysCount = $this->getMaxStayNightsCount(
			$roomTypeOriginalId,
			$checkInDateTime,
			$isIgnoreBookingRules
		);

		return ! $isIgnoreBookingRules &&
			$this->hasMaxStayLengthRules() &&
			0 < $maxStayDaysCount &&
			DateUtils::calcNights( $checkInDateTime, $checkOutDateTime ) > $maxStayDaysCount;
	}


	public function getMaxStayNightsCount( int $roomTypeOriginalId, \DateTime $requestedDate, bool $isIgnoreBookingRules ): int {

		$result = 0;

		if ( ! $isIgnoreBookingRules && $this->hasMaxStayLengthRules() ) {

			$checkInDateTime = self::getCheckInWithCorrectTimeInSiteTimeZone( $requestedDate );
			$bookingRules = $this->getBookingRulesForDate( $roomTypeOriginalId, $checkInDateTime );
			$result = $bookingRules['max_stay_length'];
		}

		return $result;
	}


	public function hasBufferDaysRules(): bool {
		return $this->hasReservationRules['buffer_days'];
	}


	public function getBufferDaysCount( int $roomTypeOriginalId, \DateTime $requestedDate, bool $isIgnoreBookingRules ): int {

		$result = 0;

		if ( ! $isIgnoreBookingRules && $this->hasBufferDaysRules() ) {

			$checkInDateTime = self::getCheckInWithCorrectTimeInSiteTimeZone( $requestedDate );
			$bookingRules = $this->getBookingRulesForDate( $roomTypeOriginalId, $checkInDateTime );
			$result = $bookingRules['buffer_days'];
		}

		return $result;
	}


	/**
	 * @param int $roomTypeOriginalId Room type ID or 0 (all room types).
	 */
	public function getMaxBufferDaysCount( int $roomTypeOriginalId ): int {
		if ( ! $this->hasBufferDaysRules() ) {
			return 0;
		} elseif ( array_key_exists( $roomTypeOriginalId, $this->cachedMaxBufferDaysCounts ) ) {
			return $this->cachedMaxBufferDaysCounts[ $roomTypeOriginalId ];
		}

		$maxBuffer = 0;

		if ( $roomTypeOriginalId !== 0 ) {
			if ( isset( $this->reservationRulesByRoomTypeIds[ $roomTypeOriginalId ]['buffer_days'] ) ) {
				foreach ( $this->reservationRulesByRoomTypeIds[ $roomTypeOriginalId ]['buffer_days'] as $rule ) {
					$maxBuffer = max( $maxBuffer, $rule['rule_value'] );
				}
			}

			// Get custom max buffer days
			$maxBuffer = max(
				$maxBuffer,
				MPHB()->getCustomBookingRulesRepository()->getMaxBufferDays( $roomTypeOriginalId )
			);

		} else {
			$roomTypeIds = array_keys( $this->reservationRulesByRoomTypeIds );

			foreach( $roomTypeIds as $roomTypeId ) {
				$maxBuffer = max( $maxBuffer, $this->getMaxBufferDaysCount( $roomTypeId ) );
			}
		}

		$this->cachedMaxBufferDaysCounts[ $roomTypeOriginalId ] = $maxBuffer;

		return $maxBuffer;
	}


	public function getBlockedRoomsCountForRoomType( int $roomTypeOriginalId, \DateTime $requestedDate, bool $isIgnoreBookingRules ): int {

		$result = 0;

		if ( ! $isIgnoreBookingRules && $this->hasNotStayInRules() ) {

			$availableRoomsCount = mphb_rooms_facade()->getActiveRoomsCountForRoomType( $roomTypeOriginalId );

			if ( 0 < $availableRoomsCount ) {

				$checkInDateTime = self::getCheckInWithCorrectTimeInSiteTimeZone( $requestedDate );
				$bookingRules = $this->getBookingRulesForDate( $roomTypeOriginalId, $checkInDateTime );

				if ( $bookingRules['not_stay_in'] ) {

					$result = $availableRoomsCount;

				} elseif ( 0 < count( $bookingRules['custom_rules_for_room_id'] ) ) {

					foreach ( $bookingRules['custom_rules_for_room_id'] as $roomSpecificRuleData ) {

						if ( $roomSpecificRuleData['not_stay_in'] ) {
							$result++;
						}
					}
				}
			}
		}

		return $result;
	}


	public function isCheckInNotAllowed( int $roomTypeOriginalId, \DateTime $checkInDate, bool $isIgnoreBookingRules ): bool {

		$result = false;

		if ( ! $isIgnoreBookingRules &&
			( $this->hasNotCheckInRules() || $this->hasCheckInDaysRules() )
		) {

			$checkInDateTime = self::getCheckInWithCorrectTimeInSiteTimeZone( $checkInDate );
			$bookingRules = $this->getBookingRulesForDate( $roomTypeOriginalId, $checkInDateTime );
			$result = $bookingRules['not_check_in'] || ! $bookingRules['in_check_in_days'];
		}

		return $result;
	}


	public function isCheckOutNotAllowed( int $roomTypeOriginalId, \DateTime $checkOutDate, bool $isIgnoreBookingRules ): bool {

		$result = false;

		if ( ! $isIgnoreBookingRules &&
			( $this->hasNotCheckOutRules() || $this->hasCheckOutDaysRules() )
		) {

			$checkOutDateTime = self::getCheckOutWithCorrectTimeInSiteTimeZone( $checkOutDate );
			$bookingRules = $this->getBookingRulesForDate( $roomTypeOriginalId, $checkOutDateTime );
			$result = $bookingRules['not_check_out'] || ! $bookingRules['in_check_out_days'];
		}

		return $result;
	}

	public function isStayInNotAllowed( int $roomTypeOriginalId, \DateTime $checkInDate, \DateTime $checkOutDate, bool $isIgnoreBookingRules ): bool {

		if ( ! $isIgnoreBookingRules && $this->hasNotStayInRules() ) {

			$testingDate = self::getCheckInWithCorrectTimeInSiteTimeZone( $checkInDate );
			$checkOutDateString = self::getCheckOutWithCorrectTimeInSiteTimeZone( $checkOutDate )->format('Ymd');

			do {

				$bookingRules = $this->getBookingRulesForDate( $roomTypeOriginalId, $testingDate );

				if ( $bookingRules['not_stay_in'] ) {

					return true;
				}

				$testingDate->modify( '+1 day' );
				$testingDateString = $testingDate->format('Ymd');

			} while ( $testingDateString < $checkOutDateString );
		}

		return false;
	}


	public function isBookingRulesViolated( int $roomTypeOriginalId, \DateTime $checkInDate, \DateTime $checkOutDate, bool $isIgnoreBookingRules ): bool {

		// do not correct check-in check-out dates because we do this in each method separatly
		return $this->isCheckInEarlierThanMinAdvanceDate( $roomTypeOriginalId, $checkInDate, $isIgnoreBookingRules ) ||
			$this->isCheckInLaterThanMaxAdvanceDate( $roomTypeOriginalId, $checkInDate, $isIgnoreBookingRules ) ||
			$this->isMinStayNightsRuleViolated( $roomTypeOriginalId, $checkInDate, $checkOutDate, $isIgnoreBookingRules ) ||
			$this->isMaxStayNightsRuleViolated( $roomTypeOriginalId, $checkInDate, $checkOutDate, $isIgnoreBookingRules ) ||
			$this->isCheckInNotAllowed( $roomTypeOriginalId, $checkInDate, $isIgnoreBookingRules ) ||
			$this->isCheckOutNotAllowed( $roomTypeOriginalId, $checkOutDate, $isIgnoreBookingRules ) ||
			$this->isStayInNotAllowed( $roomTypeOriginalId, $checkInDate, $checkOutDate, $isIgnoreBookingRules );
	}

	/**
	 * @return int[]
	 */
	public function getUnavailableRoomIds( int $roomTypeOriginalId, \DateTime $checkInDate, \DateTime $checkOutDate, bool $isIgnoreBookingRules ) {

		$checkInDateTime = self::getCheckInWithCorrectTimeInSiteTimeZone( $checkInDate );
		$checkOutDateTime = self::getCheckOutWithCorrectTimeInSiteTimeZone( $checkOutDate );

		if ( $isIgnoreBookingRules ) {
			return array();

		} elseif ( ! $this->hasCheckInDaysRules() && ! $this->hasCheckOutDaysRules() &&
			! $this->hasMinAdvanceReservationRules() && ! $this->hasMaxAdvanceReservationRules() &&
			! $this->hasMinStayLengthRules() && ! $this->hasMaxStayLengthRules() &&
			! $this->hasNotCheckInRules() && ! $this->hasNotCheckOutRules() && ! $this->hasNotStayInRules()
		) {
			return array();

		} elseif ( $this->isBookingRulesViolated( $roomTypeOriginalId, $checkInDateTime, $checkOutDateTime, $isIgnoreBookingRules ) ) {

			return MPHB()->getRoomPersistence()->findAllIdsByType( $roomTypeOriginalId );
		}

		$unavailableRoomIds = array();

		// Check check-in and check-out dates
		$testDates = array(
			'not_check_in'  => $checkInDateTime,
			'not_check_out' => $checkOutDateTime,
		);

		foreach ( $testDates as $checkRule => $date ) {
			$bookingRules = $this->getBookingRulesForDate( $roomTypeOriginalId, $date );

			foreach ( $bookingRules['custom_rules_for_room_id'] as $roomId => $roomBlocks ) {
				if ( $roomBlocks[ $checkRule ] ) {
					$unavailableRoomIds[] = $roomId;
				}
			}
		}

		// Check stay-in dates
		$testingDate = clone $checkInDateTime;
		$checkOutDateString = $checkOutDateTime->format('Ymd');

		do {

			$bookingRules = $this->getBookingRulesForDate( $roomTypeOriginalId, $testingDate );

			foreach ( $bookingRules['custom_rules_for_room_id'] as $roomId => $roomSpecificRuleData ) {

				if ( $roomSpecificRuleData['not_stay_in'] ) {

					$unavailableRoomIds[] = $roomId;
				}
			}

			$testingDate->modify( '+1 day' );
			$testingDateString = $testingDate->format('Ymd');

		} while ( $testingDateString < $checkOutDateString );

		$unavailableRoomIds = array_unique( $unavailableRoomIds );
		// reset keys after array_unique() and sort room ids
		sort( $unavailableRoomIds );

		return $unavailableRoomIds;
	}

	/**
	 * Currently this method is only used in the old booking calendar.
	 *
	 * @since 4.10.0 added new parameter - $period.
	 *
	 * @param \DatePeriod $period
	 * @return array <code>[
	 *     Room ID => [
	 *         Date string ("Y-m-d") => "comment_1, comment_2, ..."
	 *     ]
	 * ]</code>
	 */
	public function getNotStayInComments( int $roomTypeOriginalId, array $roomIds, $period ): array {
		$result = array();

		foreach ( $period as $date ) {
			$dateStr = DateUtils::formatDateDB( $date );
			$blocksByDate = $this->getBlocksByDate( $roomTypeOriginalId, $date );

			foreach ( $blocksByDate as $block ) {
				if ( $block['room_type_id'] !== 0 && $block['room_type_id'] !== $roomTypeOriginalId ) {
					continue;
				}

				if ( ! $block['not_stay_in'] ) {
					continue;
				}

				$roomId = $block['room_id'];

				if ( $roomId === 0 ) {
					// Copy block for each requested room
					foreach( $roomIds as $id ) {
						if ( ! isset( $result[ $id ][ $dateStr ] ) ) {
							$result[ $id ][ $dateStr ] = $block['comment'];
						} else {
							$result[ $id ][ $dateStr ] .= ', ' . $block['comment'];
						}
					}

				} elseif ( in_array( $roomId, $roomIds ) ) {
					// Add comment for one room
					if ( ! isset( $result[ $roomId ][ $dateStr ] ) ) {
						$result[ $roomId ][ $dateStr ] = $block['comment'];
					} else {
						$result[ $roomId ][ $dateStr ] .= ', ' . $block['comment'];
					}
				}
			}
		}

		/**
		 * @since 4.10.0
		 *
		 * @param array $calendarComments
		 * @param int $roomTypeId
		 * @param int[] $roomIds
		 * @param \DatePeriod $period
		 */
		$result = apply_filters( 'mphb_get_calendar_comments_for_room_type', $result, $roomTypeOriginalId, $roomIds, $period );

		return $result;
	}

	/**
	 * Currently this method is only used for export.
	 *
	 * @return array <code>[
	 *     [
	 *         roomTypeId => int,
	 *         roomId     => int,
	 *         startDate  => DateTime,
	 *         endDate    => DateTime,
	 *         comment    => string
	 *     ],
	 *     ...
	 * ]</code>
	 */
	public function getNotStayInRulesData( int $roomTypeOriginalId, int $requestedRoomId ): array {
		$result = array();

		$periods = MPHB()->getBlocksRepository()->getNoStayPeriodsForRoom( $roomTypeOriginalId, $requestedRoomId );

		foreach ( $periods as $period ) {
			$dateFrom = DateUtils::createDate( $period['date_from'] );
			$dateTo   = DateUtils::createDate( $period['date_to'] );

			if ( $dateFrom !== null && $dateTo !== null ) {
				$result[] = array(
					'roomTypeId' => $roomTypeOriginalId,
					'roomId'     => $requestedRoomId,
					'startDate'  => $dateFrom,
					'endDate'    => $dateTo,
					'comment'    => $period['comment'],
				);
			}
		}

		/**
		 * @since 4.10.0
		 *
		 * @param array $adminBlocks
		 * @param int $roomTypeId
		 * @param int $roomId
		 */
		$result = apply_filters( 'mphb_get_admin_blocks_for_export', $result, $roomTypeOriginalId, $requestedRoomId );

		return $result;
	}

	/**
	 * @return array <code>[ buffer_days, allow_check_in, ... ]</code>
	 */
	private function getCustomBookingRulesByDate( int $roomTypeId, \DateTime $date ): array {
		if ( $roomTypeId === 0 ) {
			return array(); // Custom booking rules does not have 0-room-type rules
		}

		$year  = (int) $date->format( 'Y' );
		$month = $year * 12 + (int) $date->format( 'n' );

		if ( ! isset( $this->cachedCustomBookingRules[ $roomTypeId ][ $month ] ) ) {
			$rulesForMonth = $this->getCustomBookingRulesForMonth( $roomTypeId, $date );

			$this->cachedCustomBookingRules[ $roomTypeId ][ $month ] = $rulesForMonth;
		}

		$dateStr = DateUtils::formatDateDB( $date );

		return $this->cachedCustomBookingRules[ $roomTypeId ][ $month ][ $dateStr ] ?? array();
	}

	/**
	 * @return array <code>[ Date string ("Y-m-d") => [ buffer_days, allow_check_in, ... ] ]</code>
	 */
	private function getCustomBookingRulesForMonth( int $roomTypeId, \DateTime $dateOfMonth ): array {
		$dateFromStr = date( 'Y-m-01', $dateOfMonth->getTimestamp() );
		$dateToStr   = date( 'Y-m-t', $dateOfMonth->getTimestamp() );

		return MPHB()->getCustomBookingRulesRepository()->getRulesForPeriod( $roomTypeId, $dateFromStr, $dateToStr );
	}

	private function hasCheckInDaysRules(): bool {
		return $this->hasReservationRules['check_in_days'];
	}

	private function hasCheckOutDaysRules(): bool {
		return $this->hasReservationRules['check_out_days'];
	}

	private function hasMaxAdvanceReservationRules(): bool {
		return $this->hasReservationRules['max_advance_reservation'];
	}

	private function hasMaxStayLengthRules(): bool {
		return $this->hasReservationRules['max_stay_length'];
	}

	private function hasMinAdvanceReservationRules(): bool {
		return $this->hasReservationRules['min_advance_reservation'];
	}

	private function hasMinStayLengthRules(): bool {
		return $this->hasReservationRules['min_stay_length'];
	}

	private function hasNotCheckInRules(): bool {
		if ( $this->hasNotCheckInRules === null ) {
			$this->hasNotCheckInRules = MPHB()->getBlocksRepository()->hasNotCheckInRules();
		}

		return $this->hasNotCheckInRules;
	}

	private function hasNotCheckOutRules(): bool {
		if ( $this->hasNotCheckOutRules === null ) {
			$this->hasNotCheckOutRules = MPHB()->getBlocksRepository()->hasNotCheckOutRules();
		}

		return $this->hasNotCheckOutRules;
	}

	private function hasNotStayInRules(): bool {
		if ( $this->hasNotStayInRules === null ) {
			$this->hasNotStayInRules = MPHB()->getBlocksRepository()->hasNotStayInRules();

			if ( ! $this->hasNotStayInRules ) {
				// Filter for linked accommodations
				/**
				 * @since 4.10.0
				 *
				 * @param bool $hasNotStayInRules
				 */
				$this->hasNotStayInRules = apply_filters( 'mphb_has_not_stay_in_rules', $this->hasNotStayInRules );
			}
		}

		return $this->hasNotStayInRules;
	}

	/**
	 * @param int $roomTypeId Room type ID or 0 (all room types).
	 * @return array <code>[ Block ID => [ room_type_id, room_id, ... ] ]</code>
	 */
	private function getBlocksByDate( int $roomTypeId, \DateTime $date ): array {
		$dateStr = DateUtils::formatDateDB( $date );

		if ( ! isset( $this->blocksByDate[ $roomTypeId ][ $dateStr ] ) ) {
			$blocksByDate = $this->getBlocksForMonth( $roomTypeId, $date );

			// Treat trashed rooms as deleted, especially since "trash" is not
			// included in the "all" list in RoomPersistence

			// Filter trashed rooms
			$trashedRooms = mphb_rooms_facade()->getTrashedRoomIds( $roomTypeId );

			if ( ! empty( $trashedRooms ) ) {
				foreach ( array_keys( $blocksByDate ) as $dateStr ) {
					$blocksByDate[ $dateStr ] = array_filter(
						$blocksByDate[ $dateStr ],
						fn( $block ) => ! in_array( $block['room_id'], $trashedRooms )
					);
				}
			}

			// Filter trashed room types
			if ( $roomTypeId === 0 ) {
				$trashedRoomTypes = mphb_rooms_facade()->getTrashedRoomTypeIds();

				if ( ! empty( $trashedRoomTypes ) ) {
					foreach ( array_keys( $blocksByDate ) as $dateStr ) {
						$blocksByDate[ $dateStr ] = array_filter(
							$blocksByDate[ $dateStr ],
							fn( $block ) => ! in_array( $block['room_type_id'], $trashedRoomTypes )
						);
					}
				}
			}

			if ( ! isset( $this->blocksByDate[ $roomTypeId ] ) ) {
				$this->blocksByDate[ $roomTypeId ] = array();
			}

			$this->blocksByDate[ $roomTypeId ] += $blocksByDate;
		}

		return $this->blocksByDate[ $roomTypeId ][ $dateStr ];
	}

	/**
	 * @return array <code>[
	 *     Date string ("Y-m-d") => [
	 *         Block ID => [ room_type_id, room_id, ... ]
	 *     ]
	 * ]
	 */
	private function getBlocksForMonth( int $roomTypeId, \DateTime $dateOfMonth ): array {
		$monthStartStr = $dateOfMonth->format( 'Y-m-01' );
		$monthEndStr   = $dateOfMonth->format( 'Y-m-t' );

		$monthStart    = DateUtils::createDate( $monthStartStr );
		$monthEnd      = DateUtils::createDate( $monthEndStr );

		if ( $monthStart === null || $monthEnd === null ) {
			return array();
		}

		$blocksForMonth = MPHB()->getBlocksRepository()->getItemsForPeriod( $roomTypeId, $monthStartStr, $monthEndStr );

		// Filter blocks without restrictions
		$blocksForMonth = array_filter( $blocksForMonth, fn( $block ) => $block['has_restrictions'] );

		// Filter blocks with invalid dates
		$blocksForMonth = array_filter( $blocksForMonth, fn( $block ) => $block['date_to'] >= $block['date_from'] );

		$this->loadedBlocks += $blocksForMonth;

		// Sort blocks by date
		$datesInMonth = DateUtils::createDatesInRange( $monthStart, $monthEnd );
		$blocksByDate = array_fill_keys( array_keys( $datesInMonth ), array() );

		foreach ( array_keys( $datesInMonth ) as $dateStr ) {
			foreach ( $blocksForMonth as $blockId => $block ) {
				if ( $dateStr >= $block['date_from'] && $dateStr <= $block['date_to'] ) {
					$blocksByDate[ $dateStr ][ $blockId ] = &$this->loadedBlocks[ $blockId ];
				}
			}
		}

		return $blocksByDate;
	}
}
