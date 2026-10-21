<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/** A time budget for one tick, measured with hrtime() inside this request. */
final class Budget
{
    private float $start;
    private float $seconds;

    public function __construct(float $seconds)
    {
        $this->seconds = $seconds;
        $this->start   = hrtime(true) / 1e9;
    }

    public function elapsed(): float
    {
        return hrtime(true) / 1e9 - $this->start;
    }

    public function remaining(): float
    {
        return max(0.0, $this->seconds - $this->elapsed());
    }

    public function exhausted(): bool
    {
        return $this->remaining() <= 0.0;
    }

    /** A smaller budget carved from this one. */
    public function slice(float $max): Budget
    {
        return new Budget(min($max, $this->remaining()));
    }
}
