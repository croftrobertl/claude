<?php

namespace MPHB\Entities;

use MPHB\PostTypes\SeasonCPT;
use MPHB\Utils\DateUtils;

/**
 *
 * @param array $atts
 * @param int $atts['id'] Id of season
 * @param string $atts['title'] Title of season
 * @param string $atts['description'] Description of season
 * @param DateTime $atts['start_date'] Start Date of season
 * @param DateTime $atts['end_date'] End Date of season
 * @param array $atts['days'] Days of season
 */
class Season {

	/**
	 *
	 * @var int
	 */
	private $id;

	/**
	 *
	 * @var string
	 */
	private $title;

	/**
	 *
	 * @var string
	 */
	private $description;

	/**
	 *
	 * @var \DateTime
	 */
	protected $startDate;

	/**
	 *
	 * @var \DateTime
	 */
	protected $endDate;

	/**
	 *
	 * @var array
	 */
	private $days = array();

	/**
	 *
	 * @var \DateTime[]
	 */
	private $dates = array();

	/**
	 * @since 5.0.0
	 *
	 * @var string 'none', 'year' ect.
	 */
	private $repeatPeriod;

	/**
	 * @since 5.0.0
	 *
	 * @var \DateTime|null
	 */
	protected $repeatUntilDate;

	public function __construct( $atts ) {
		$this->id              = $atts['id'];
		$this->title           = $atts['title'];
		$this->description     = $atts['description'];
		$this->startDate       = $atts['start_date'];
		$this->endDate         = $atts['end_date'];
		$this->days            = array_map( '\MPHB\Utils\CastUtils::toInt', $atts['days'] );
		$this->repeatPeriod    = $atts['repeat_period'] ?? SeasonCPT::REPEAT_PERIOD_DEFAULT;
		$this->repeatUntilDate = $atts['repeat_until_date'] ?? null;
		$this->setupDates();
	}

	protected function setupDates() {

		if ( is_null( $this->startDate ) || is_null( $this->endDate ) ) {
			return;
		}

		$this->startDate->setTime( 0, 0 );
		$this->endDate->setTime( 23, 59, 59, 999 );

		$this->addDatesForPeriod( $this->startDate, $this->endDate );
	}

	/**
	 * @since 5.0.0
	 */
	protected function addDatesForPeriod( \DateTime $startDate, \DateTime $endDate ) {
		$period = DateUtils::createDatePeriod( $startDate, $endDate, true );
		$dates  = iterator_to_array( $period );

		// Remove not allowed week days from period
		if ( count( $this->days ) < 7 ) {
			$dates = array_filter( $dates, array( $this, 'isAllowedWeekDay' ) );
		}

		if ( ! empty( $dates ) ) {
			$this->dates = array_merge( $this->dates, $dates );
		}
	}

	/**
	 * @param \DateTime $date
	 *
	 * @return bool
	 */
	public function isDateInSeason( $date ) {
		return $date >= $this->startDate && $date <= $this->endDate && $this->isAllowedWeekDay( $date );
	}

	/**
	 *
	 * @param \DateTime $date
	 *
	 * @return bool
	 */
	public function isAllowedWeekDay( $date ) {
		$weekDay = $date->format( 'w' );
		return in_array( $weekDay, $this->days );
	}

	/**
	 *
	 * @return int
	 */
	function getId() {
		return $this->id;
	}

	/**
	 *
	 * @return string
	 */
	function getTitle() {
		return $this->title;
	}

	/**
	 *
	 * @return \DateTime
	 */
	function getDescription() {
		return $this->description;
	}

	/**
	 *
	 * @return \DateTime|null
	 */
	function getStartDate() {
		return $this->startDate;
	}

	/**
	 *
	 * @return \DateTime|null
	 */
	function getEndDate() {
		return $this->endDate;
	}

	/**
	 *
	 * @return array
	 */
	public function getDays() {
		return $this->days;
	}

	/**
	 * @since 5.0.0
	 *
	 * @return bool
	 */
	public function isRecurring() {
		return $this->repeatPeriod !== SeasonCPT::REPEAT_PERIOD_NONE;
	}

	/**
	 * @since 5.0.0
	 *
	 * @return string
	 */
	public function getRepeatPeriod() {
		return $this->repeatPeriod;
	}

	/**
	 * @since 5.0.0
	 *
	 * @return \DateTime|null
	 */
	public function getRepeatUntilDate() {
		return $this->repeatUntilDate;
	}

	/**
	 *
	 * @return \DateTime[]
	 */
	function getDates() {
		return $this->dates;
	}

}
