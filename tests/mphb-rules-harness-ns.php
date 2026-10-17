<?php
// The two MotoPress classes the vendored files touch but do not need whole.
namespace MPHB\Utils {
    if (!class_exists(CastUtils::class)) {
        class CastUtils { public static function toInt($v) { return (int) $v; } }
    }
}
namespace MPHB\PostTypes {
    if (!class_exists(SeasonCPT::class)) {
        class SeasonCPT { const REPEAT_PERIOD_DEFAULT = 'none'; }
    }
}
