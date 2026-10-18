<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * CSV reading. Files are read a row at a time and never held whole in memory,
 * and nothing from a row is retained beyond the caller's loop.
 */
final class Csv
{
    public const MAX_BYTES = 5242880; // 5 MB

    /**
     * Read the header row of a file, normalised (BOM stripped, trimmed).
     *
     * @return string[]
     */
    public static function header(string $path): array
    {
        $handle = @fopen($path, 'r');
        if ($handle === false) {
            return [];
        }
        $row = fgetcsv($handle, 0, ',', '"', '');
        fclose($handle);
        if (!is_array($row)) {
            return [];
        }
        return self::normalise_header($row);
    }

    /**
     * @param array<int,string|null> $row
     * @return string[]
     */
    public static function normalise_header(array $row): array
    {
        $out = [];
        foreach ($row as $i => $cell) {
            $cell = (string) $cell;
            if ($i === 0) {
                $cell = preg_replace('/^\xEF\xBB\xBF/', '', $cell) ?? $cell;
            }
            $out[] = trim($cell);
        }
        while ($out !== [] && end($out) === '') {
            array_pop($out);
        }
        return $out;
    }

    /**
     * Yield each data row as an associative array keyed by the header.
     * Short rows are padded, long rows truncated, so parsers can index safely.
     *
     * @return \Generator<int,array<string,string>>
     */
    public static function rows(string $path): \Generator
    {
        $handle = @fopen($path, 'r');
        if ($handle === false) {
            return;
        }
        try {
            $header = fgetcsv($handle, 0, ',', '"', '');
            if (!is_array($header)) {
                return;
            }
            $header = self::normalise_header($header);
            $width  = count($header);
            while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
                if ($row === [null] || $row === []) {
                    continue; // blank line
                }
                $row = array_slice(array_pad($row, $width, ''), 0, $width);
                $assoc = [];
                foreach ($header as $i => $name) {
                    $assoc[$name] = trim((string) ($row[$i] ?? ''));
                }
                yield $assoc;
            }
        } finally {
            fclose($handle);
        }
    }

    /** Is every cell in the row empty? */
    public static function is_blank(array $row): bool
    {
        foreach ($row as $value) {
            if ((string) $value !== '') {
                return false;
            }
        }
        return true;
    }
}
