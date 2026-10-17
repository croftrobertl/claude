<?php

namespace MPHB\Core;

use MPHB\Utils\DateUtils;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * This facade must contain all methods for working with booking rules
 * and rooms availability for bookings that are called from outside the
 * core (from templates, shortcodes, Gutenberg blocks, Ajax commands,
 * REST API controllers, other plugins and themes).
 */
class RoomsAvailabilityCoreAPIFacade extends AbstractCoreAPIFacade {

	/**
	 * @var BookingRulesData
	 */
	private $bookingRules = null;

	/**
	 * @var array <code>[
	 *     Room type ID => [
	 *         Year => [
	 *             Month => [
	 *                 Date string ("Y-m-d") => [ buffer_days, check_in_days, ... ]
	 *             ]
	 *         ]
	 *     ]
	 * ]</code>
	 */
	private array $cachedCustomRules = array();

	protected function getHookNamesForClearAllCache(): array {
		return array(
			'mphb_booking_status_changed',
			'save_post_' . MPHB()->postTypes()->room()->getPostType(),
			'save_post_' . MPHB()->postTypes()->roomType()->getPostType(),
			'save_post_' . MPHB()->postTypes()->rate()->getPostType(),
			'save_post_' . MPHB()->postTypes()->season()->getPostType(),
			// TODO: much better take into account only edit confirmed bookings
			'save_post_' . MPHB()->postTypes()->booking()->getPostType(),
			'update_option_mphb_check_in_days',
			'update_option_mphb_check_out_days',
			'update_option_mphb_min_stay_length',
			'update_option_mphb_max_stay_length',
			'update_option_mphb_booking_rules_custom',
			'update_option_mphb_min_advance_reservation',
			'update_option_mphb_max_advance_reservation',
			'update_option_mphb_buffer_days',
			'update_option_mphb_do_not_apply_booking_rules_for_admin',
		);
	}

	private function getBookingRules() {

		if ( null === $this->bookingRules ) {

			$this->bookingRules = new BookingRulesData();
		}

		return $this->bookingRules;
	}


	public function isCheckInEarlierThanMinAdvanceDate( int $roomTypeOriginalId, \DateTime $checkInDate, bool $isIgnoreBookingRules ) {

		return $this->getBookingRules()->isCheckInEarlierThanMinAdvanceDate(
			$roomTypeOriginalId,
			$checkInDate,
			$isIgnoreBookingRules
		);
	}


	public function getMinAdvanceReservationDaysCount( int $roomTypeOriginalId, \DateTime $requestedDate, bool $isIgnoreBookingRules ): int {

		return $this->getBookingRules()->getMinAdvanceReservationDaysCount(
			$roomTypeOriginalId,
			$requestedDate,
			$isIgnoreBookingRules
		);
	}


	public function isCheckInLaterThanMaxAdvanceDate( int $roomTypeOriginalId, \DateTime $checkInDate, bool $isIgnoreBookingRules ) {

		return $this->getBookingRules()->isCheckInLaterThanMaxAdvanceDate(
			$roomTypeOriginalId,
			$checkInDate, 
			$isIgnoreBookingRules
		);
	}


	public function getMaxAdvanceReservationDaysCount( int $roomTypeOriginalId, \DateTime $requestedDate, bool $isIgnoreBookingRules ): int {

		return $this->getBookingRules()->getMaxAdvanceReservationDaysCount(
			$roomTypeOriginalId,
			$requestedDate,
			$isIgnoreBookingRules
		);
	}


	public function getMinStayNightsCountForAllSeasons( int $roomTypeOriginalId ): int {

		return $this->getBookingRules()->getMinStayNightsCountForAllSeasons( $roomTypeOriginalId );
	}


	public function isMinStayNightsRuleViolated( int $roomTypeOriginalId, \DateTime $checkInDate, \DateTime $checkOutDate, bool $isIgnoreBookingRules ) {

		return $this->getBookingRules()->isMinStayNightsRuleViolated(
			$roomTypeOriginalId,
			$checkInDate,
			$checkOutDate,
			$isIgnoreBookingRules
		);
	}


	public function getMinStayNightsCount( int $roomTypeOriginalId, \DateTime $requestedDate, bool $isIgnoreBookingRules ): int {

		return $this->getBookingRules()->getMinStayNightsCount(
			$roomTypeOriginalId,
			$requestedDate,
			$isIgnoreBookingRules
		);
	}


	public function isMaxStayNightsRuleViolated( int $roomTypeOriginalId, \DateTime $checkInDate, \DateTime $checkOutDate, bool $isIgnoreBookingRules ) {

		return $this->getBookingRules()->isMaxStayNightsRuleViolated(
			$roomTypeOriginalId,
			$checkInDate,
			$checkOutDate,
			$isIgnoreBookingRules
		);
	}


	public function getMaxStayNightsCount( int $roomTypeOriginalId, \DateTime $requestedDate, bool $isIgnoreBookingRules ): int {

		return $this->getBookingRules()->getMaxStayNightsCount(
			$roomTypeOriginalId,
			$requestedDate,
			$isIgnoreBookingRules
		);
	}


	public function hasBufferDaysRules( bool $isIgnoreBookingRules ): bool {
		if ( $isIgnoreBookingRules ) {
			return false;
		} else {
			return $this->getBookingRules()->hasBufferDaysRules();
		}
	}


	public function getBufferDaysCount( int $roomTypeOriginalId, \DateTime $requestedDate, bool $isIgnoreBookingRules ): int {

		return $this->getBookingRules()->getBufferDaysCount(
			$roomTypeOriginalId,
			$requestedDate,
			$isIgnoreBookingRules
		);
	}

	public function getMaxBufferDaysCount( int $roomTypeOriginalId ): int {
		return $this->getBookingRules()->getMaxBufferDaysCount( $roomTypeOriginalId );
	}

	public function getBlockedRoomsCountForRoomType( int $roomTypeOriginalId, \DateTime $requestedDate, bool $isIgnoreBookingRules ): int {

		return $this->getBookingRules()->getBlockedRoomsCountForRoomType(
			$roomTypeOriginalId,
			$requestedDate,
			$isIgnoreBookingRules
		);
	}


	public function isCheckInNotAllowed( int $roomTypeOriginalId, \DateTime $checkInDate, bool $isIgnoreBookingRules ): bool {

		return $this->getBookingRules()->isCheckInNotAllowed(
			$roomTypeOriginalId,
			$checkInDate,
			$isIgnoreBookingRules
		);
	}


	public function isCheckOutNotAllowed( int $roomTypeOriginalId, \DateTime $checkOutDate, bool $isIgnoreBookingRules ): bool {

		return $this->getBookingRules()->isCheckOutNotAllowed(
			$roomTypeOriginalId,
			$checkOutDate,
			$isIgnoreBookingRules
		);
	}

	public function isStayInNotAllowed( int $roomTypeOriginalId, \DateTime $checkInDate, \DateTime $checkOutDate, bool $isIgnoreBookingRules ): bool {

		return $this->getBookingRules()->isStayInNotAllowed(
			$roomTypeOriginalId,
			$checkInDate,
			$checkOutDate,
			$isIgnoreBookingRules
		);
	}


	public function isBookingRulesViolated( int $roomTypeOriginalId, \DateTime $checkInDate, \DateTime $checkOutDate, bool $isIgnoreBookingRules ): bool {

		return $this->getBookingRules()->isBookingRulesViolated(
			$roomTypeOriginalId,
			$checkInDate,
			$checkOutDate,
			$isIgnoreBookingRules
		);
	}

	/**
	 * @return int[]
	 */
	public function getUnavailableRoomIds( int $roomTypeOriginalId, \DateTime $checkInDate, \DateTime $checkOutDate, bool $isIgnoreBookingRules ) {

		return $this->getBookingRules()->getUnavailableRoomIds(
			$roomTypeOriginalId,
			$checkInDate,
			$checkOutDate,
			$isIgnoreBookingRules
		);
	}

	/**
	 * Currently this method is only used in the old booking calendar.
	 *
	 * @param \DatePeriod $period
	 * @return array [ room_id (int) => [ date (string as Y-m-d) => 'comment_1, comment_2, ...' ], ... ]
	 */
	public function getNotStayInComments( int $roomTypeOriginalId, array $roomIds, $period ): array {
		return $this->getBookingRules()->getNotStayInComments(
			$roomTypeOriginalId,
			$roomIds,
			$period
		);
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
		return $this->getBookingRules()->getNotStayInRulesData(
			$roomTypeOriginalId,
			$requestedRoomId
		);
	}

	/**
	 * @return \MPHB\Core\RoomTypeAvailabilityStatus constant
	 */
	public function getRoomTypeAvailabilityStatus( int $roomTypeOriginalId, \DateTime $date, bool $isIgnoreBookingRules ) {

		$cacheDataId = 'getRoomTypeAvailabilityStatus' . $roomTypeOriginalId . ( $isIgnoreBookingRules ? '_1' : '_0' );
		$dataSubId   = $date->format( 'Y-m-d' );
		$result      = $this->getCachedData( $cacheDataId, $dataSubId );

		if ( static::CACHED_DATA_NOT_FOUND === $result ) {

			$result = RoomAvailabilityHelper::getRoomTypeAvailabilityStatus( $roomTypeOriginalId, $date, $isIgnoreBookingRules );

			$this->setCachedData( $cacheDataId, $dataSubId, $result );
		}

		return $result;
	}

	/**
	 * @return \MPHB\Core\RoomTypeAvailabilityData
	 */
	public function getRoomTypeAvailabilityData( int $roomTypeOriginalId, \DateTime $date, bool $isIgnoreBookingRules ) {

		$cacheDataId = 'getRoomTypeAvailabilityData' . $roomTypeOriginalId . ( $isIgnoreBookingRules ? '_1' : '_0' );
		$dataSubId   = $date->format( 'Y-m-d' );
		$result      = $this->getCachedData( $cacheDataId, $dataSubId );

		if ( static::CACHED_DATA_NOT_FOUND === $result ) {

			$result = RoomAvailabilityHelper::getRoomTypeAvailabilityData( $roomTypeOriginalId, $date, $isIgnoreBookingRules );

			// do not cache data in 1 year because it is too infrequently needed by users
			if ( $date < ( new \DateTime() )->add( new \DateInterval( 'P1Y' ) ) ) {

				$this->setCachedData( $cacheDataId, $dataSubId, $result, 1800 );
			}
		}

		return $result;
	}

	/**
	 * Returns first available date for check-in for room type or
	 * any of room types if $roomTypeOriginalId = 0
	 *
	 * @return \DateTime
	 */
	public function getFirstAvailableCheckInDate( int $roomTypeOriginalId, bool $isIgnoreBookingRules ) {

		$cacheDataId = 'getFirstAvailableCheckInDate' . $roomTypeOriginalId . ( $isIgnoreBookingRules ? '_1' : '_0' );
		$result      = $this->getCachedData( $cacheDataId );

		if ( static::CACHED_DATA_NOT_FOUND === $result ) {

			$result = RoomAvailabilityHelper::getFirstAvailableCheckInDate( $roomTypeOriginalId, $isIgnoreBookingRules );

			$this->setCachedData( $cacheDataId, '', $result );
		}

		return $result;
	}

	/**
	 * @param array $availableRooms [ room_type_original_id (int) => available_rooms_count (int) ]
	 * @return array [ room_type_original_id (int) => rooms_count (int), ... ]
	 */
	public function getRecommendedRoomsCombination( array $availableRooms, int $requestedAdultsCount, int $requestedChildrenCount = 0 ): array {
		return Helpers\RoomsRecommendationHelper::getRecommendedRoomsCombination( $availableRooms, $requestedAdultsCount, $requestedChildrenCount );
	}
}
