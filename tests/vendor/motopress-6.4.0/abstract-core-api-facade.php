<?php

namespace MPHB\Core;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Base class for all core API facades.
 */
abstract class AbstractCoreAPIFacade {

	const OPTION_NAME_CACHE_DATA_PREFIX           = 'MPHB_cache_data_prefix';
	const WP_CACHE_GROUP                          = 'MPHB';
	const CACHED_DATA_NOT_FOUND                   = 'MPHB_CACHED_DATA_NOT_FOUND';
	const MAX_SIZE_OF_TRANSIENT_CACHED_DATA_ARRAY = 370;


	private $cacheDataPrefix = null;


	public function __construct() {

		add_action(
			'plugins_loaded',
			function() {

				$hookNamesForClearAllCache = $this->getHookNamesForClearAllCache();

				if ( ! empty( $hookNamesForClearAllCache ) ) {

					foreach ( $hookNamesForClearAllCache as $hookName ) {

						add_action(
							$hookName,
							function() {
								$this->cacheDataPrefix = time();
								// for optimization we can create several cache prefixes
								// and delete them by different lists of hooks
								update_option( static::OPTION_NAME_CACHE_DATA_PREFIX, $this->cacheDataPrefix, true );
							}
						);
					}
				}
			}
		);
	}

	/**
	 * @return array with hooks names if facade use cache or empty array otherwise.
	 */
	protected function getHookNamesForClearAllCache(): array {
		return array();
	}


	// TODO: add separate cache for each facade
	private function getPrefixedCacheDataId( string $cacheDataId ) {

		if ( ! $this->cacheDataPrefix ) {

			$this->cacheDataPrefix = get_option( static::OPTION_NAME_CACHE_DATA_PREFIX );

			if ( ! $this->cacheDataPrefix ) {

				$this->cacheDataPrefix = time();
				update_option( static::OPTION_NAME_CACHE_DATA_PREFIX, $this->cacheDataPrefix, true );
			}
		}

		return $this->cacheDataPrefix . '_' . $cacheDataId;
	}


	protected function getCachedData( string $cacheDataId, string $cacheDataSubId = '', bool $isUseTransientCache = false ) {

		$result = null;

		if ( $isUseTransientCache ) {

			$result = get_transient( $this->getPrefixedCacheDataId( $cacheDataId ) );

			if ( false === $result ) {
				$result = static::CACHED_DATA_NOT_FOUND;
			}
		} else {

			$isCachedDataWasFound = true;

			$result = wp_cache_get(
				$this->getPrefixedCacheDataId( $cacheDataId ),
				static::WP_CACHE_GROUP,
				false,
				$isCachedDataWasFound
			);

			if ( ! $isCachedDataWasFound ) {
				$result = static::CACHED_DATA_NOT_FOUND;
			}
		}

		if ( ! empty( $cacheDataSubId ) && is_array( $result ) && static::CACHED_DATA_NOT_FOUND !== $result ) {

			if ( isset( $result[ $cacheDataSubId ] ) ) {

				$result = $result[ $cacheDataSubId ];

			} else {

				$result = static::CACHED_DATA_NOT_FOUND;
			}
		}

		return $result;
	}

	/**
	 * IMPORTANT: try to create minimum transient cache records to reduce database size and usage!
	 */
	protected function setCachedData( string $cacheDataId, string $cacheDataSubId, $data, int $expirationInSeconds = 1800 /** 30 min */, bool $isUseTransientCache = false ) {

		$cachingData = $data;

		if ( ! empty( $cacheDataSubId ) ) {

			$alreadyCachedData = static::getCachedData( $cacheDataId, '', $isUseTransientCache );

			if ( static::CACHED_DATA_NOT_FOUND === $alreadyCachedData || ! is_array( $alreadyCachedData ) ) {

				$cachingData = array();

			} else {

				$cachingData = $alreadyCachedData;
			}

			$cachingData[ $cacheDataSubId ] = $data;

			if ( static::MAX_SIZE_OF_TRANSIENT_CACHED_DATA_ARRAY < count( $cachingData ) ) {
				return;
			}
		}

		if ( $isUseTransientCache ) {

			set_transient(
				$this->getPrefixedCacheDataId( $cacheDataId ),
				$cachingData,
				$expirationInSeconds
			);

		} else {
			wp_cache_set(
				$this->getPrefixedCacheDataId( $cacheDataId ),
				$cachingData,
				static::WP_CACHE_GROUP,
				$expirationInSeconds
			);
		}
	}
}
