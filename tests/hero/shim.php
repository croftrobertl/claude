<?php
/**
 * A namespaced `file_exists()` for tests/hero/run.php.
 *
 * WHY A FILE OF ITS OWN: `file_exists` is a real PHP function and cannot be
 * redeclared globally. Hero is namespaced, so an unqualified call inside it
 * resolves to DCC_Checkout\file_exists FIRST — which is also exactly what
 * happens in production, where none is defined and PHP falls through to its
 * own. So this exercises the real resolution path rather than standing in for
 * it. (tests/layout does the same for setcookie.)
 *
 * It has to be a separate file because PHP allows an unbraced `namespace` only
 * as a file's first statement, and run.php has top-level code before this
 * point; mixing braced and unbraced namespace blocks in one file is an error.
 */

namespace DCC_Checkout;

function file_exists($path)
{
    return in_array($path, $GLOBALS['state']['on_disk'] ?? [], true);
}
