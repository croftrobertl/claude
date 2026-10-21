<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * A PHP file is syntax-checked before it is put back: `php -l` through
 * proc_open where available, otherwise a token_get_all parse.
 */
final class Php_Check
{
    /** @return array{ok:bool,method:string,message:string} */
    public static function lint(string $file): array
    {
        if (!is_readable($file)) {
            return ['ok' => false, 'method' => 'none', 'message' => 'unreadable'];
        }
        $cli = self::cli();
        if ($cli !== null) {
            $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
            $proc = @proc_open([$cli, '-l', '-d', 'display_errors=1', $file], $spec, $pipes);
            if (is_resource($proc)) {
                fclose($pipes[0]);
                $out = (string) stream_get_contents($pipes[1]);
                $err = (string) stream_get_contents($pipes[2]);
                fclose($pipes[1]);
                fclose($pipes[2]);
                $code = proc_close($proc);
                $ok   = $code === 0 && str_contains($out . $err, 'No syntax errors');
                return ['ok' => $ok, 'method' => 'php -l', 'message' => trim($out . ' ' . $err)];
            }
        }
        return self::tokens($file);
    }

    private static function cli(): ?string
    {
        if (!function_exists('proc_open')) {
            return null;
        }
        $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
        if (in_array('proc_open', $disabled, true)) {
            return null;
        }
        $bin = defined('PHP_BINARY') && is_string(PHP_BINARY) && PHP_BINARY !== '' ? PHP_BINARY : 'php';
        // On a web request PHP_BINARY is php-fpm or the Apache module; prefer a CLI on PATH then.
        if (str_contains($bin, 'fpm') || str_contains($bin, 'lsphp') || !is_executable($bin)) {
            foreach (['/usr/local/bin/php', '/usr/bin/php', '/opt/cpanel/ea-php83/root/usr/bin/php', 'php'] as $cand) {
                if ($cand === 'php' || is_executable($cand)) {
                    return $cand;
                }
            }
        }
        return $bin;
    }

    /** @return array{ok:bool,method:string,message:string} */
    public static function tokens(string $file): array
    {
        if (!function_exists('token_get_all')) {
            return ['ok' => false, 'method' => 'none', 'message' => 'no tokenizer'];
        }
        $code = (string) file_get_contents($file);
        try {
            $tokens = token_get_all($code, TOKEN_PARSE);
        } catch (\Throwable $e) {
            return ['ok' => false, 'method' => 'tokens', 'message' => $e->getMessage()];
        }
        $depth = 0;
        $paren = 0;
        $open  = false;
        foreach ($tokens as $t) {
            if (is_array($t)) {
                if ($t[0] === T_OPEN_TAG || $t[0] === T_OPEN_TAG_WITH_ECHO) {
                    $open = true;
                }
                if ($t[0] === T_INLINE_HTML && !$open && trim($t[1]) !== '') {
                    return ['ok' => false, 'method' => 'tokens', 'message' => 'output before the opening tag'];
                }
                if ($t[0] === T_CURLY_OPEN || $t[0] === T_DOLLAR_OPEN_CURLY_BRACES) {
                    $depth++;
                }
                continue;
            }
            if ($t === '{') {
                $depth++;
            } elseif ($t === '}') {
                $depth--;
            } elseif ($t === '(') {
                $paren++;
            } elseif ($t === ')') {
                $paren--;
            }
            if ($depth < 0 || $paren < 0) {
                return ['ok' => false, 'method' => 'tokens', 'message' => 'unbalanced brackets'];
            }
        }
        if (!$open) {
            return ['ok' => false, 'method' => 'tokens', 'message' => 'no PHP opening tag'];
        }
        $ok = $depth === 0 && $paren === 0;
        return ['ok' => $ok, 'method' => 'tokens', 'message' => $ok ? 'balanced' : 'unbalanced brackets'];
    }
}
