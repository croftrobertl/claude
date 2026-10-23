<?php
/**
 * The confirmation screen for Seal, Restore and Update Now: one sentence
 * saying what will change, then Confirm or Cancel.
 *
 * @var string $confirm seal | restore | update_now
 * @var string $target
 */

use DCCR\Actions;
use DCCR\Admin;
use DCCR\Fortress\Lovrijenac;
use DCCR\Journal;
use DCCR\Site;
use DCCR\Text;
use DCCR\Vault;

if (!defined('ABSPATH')) {
    exit;
}

$sentence = '';
$ok       = true;
switch ($confirm) {
    case 'seal':
        $abs = str_starts_with($target, '/') ? $target : Site::abspath() . '/' . ltrim($target, '/');
        if (is_file($abs)) {
            $sentence = sprintf(
                /* translators: 1: path, 2: size, 3: when changed */
                __('Seal will accept the current %1$s, %2$s, changed %3$s, as the good copy. Ragusa will restore to this version from now on, or treat it as the baseline.', 'dcc-ragusa'),
                Site::rel($abs),
                Text::bytes((int) filesize($abs)),
                Site::when((int) filemtime($abs))
            );
        } elseif (!is_dir($abs) && \DCCR\Fortress\Revelin::guard_label($abs) === null && \DCCR\Fortress\Minceta::forget_would($abs)) {
            $sentence = sprintf(
                /* translators: %s: path */
                __('Seal will remove %s from the baseline: Ragusa will stop reporting it as missing. Nothing on disk changes.', 'dcc-ragusa'),
                Site::rel($abs)
            );
        } else {
            $ok       = false;
            /* translators: %s: path */
            $sentence = sprintf(__('There is no file at %s.', 'dcc-ragusa'), $target);
        }
        break;
    case 'restore':
        if (ctype_digit($target)) {
            $row = Journal::get((int) $target);
            if ($row === null) {
                $ok       = false;
                $sentence = __('No such journal entry.', 'dcc-ragusa');
            } else {
                $sentence = sprintf(
                    /* translators: 1: action, 2: target, 3: when */
                    __('Undo will reverse "%1$s" on %2$s (%3$s): what Ragusa moved comes back, and what it put in place is set aside.', 'dcc-ragusa'),
                    Actions::label((string) $row['action']),
                    (string) $row['target'],
                    Site::when((int) $row['created_at'])
                );
            }
        } else {
            $entry = Vault::entry($target);
            if ($entry === null) {
                $ok       = false;
                $sentence = __('No such sealed copy.', 'dcc-ragusa');
            } else {
                $sentence = sprintf(
                    /* translators: 1: label, 2: sealed when, 3: version */
                    __('Restore will put the sealed copy of %1$s (sealed %2$s%3$s) back in place. Whatever is there now is kept in quarantine first.', 'dcc-ragusa'),
                    (string) $entry['label'],
                    Site::when((int) $entry['sealed_at']),
                    $entry['version'] !== '' ? ', version ' . $entry['version'] : ''
                );
            }
        }
        break;
    case 'update_now':
        $installed = Lovrijenac::installed();
        if (!isset($installed['plugins'][$target])) {
            $ok       = false;
            $sentence = __('That plugin is not installed.', 'dcc-ragusa');
        } else {
            $sentence = sprintf(
                /* translators: 1: name, 2: version */
                __('Update Now will update %1$s from version %2$s to the newest version on WordPress.org. Revelin seals the current version first and Sveti Ivan checks the site afterwards; if the checks fail twice, the update is rolled back.', 'dcc-ragusa'),
                $installed['plugins'][$target]['name'],
                $installed['plugins'][$target]['version']
            );
        }
        break;
}
?>
<div class="wrap dccr">
    <h1 class="dccr-title"><?php esc_html_e('Ragusa', 'dcc-ragusa'); ?></h1>
    <div class="dccr-confirm">
        <h2 class="dccr-h2"><?php echo esc_html(match ($confirm) { 'seal' => __('Seal This File?', 'dcc-ragusa'), 'restore' => __('Restore?', 'dcc-ragusa'), default => __('Update This Plugin Now?', 'dcc-ragusa') }); ?></h2>
        <p class="dccr-confirm__sentence"><?php echo esc_html($sentence); ?></p>
        <div class="dccr-actions">
            <?php if ($ok) : ?>
                <?php echo Admin::form($confirm, ['target' => $target], __('Confirm', 'dcc-ragusa'), 'button button-primary dccr-button', true); ?>
            <?php endif; ?>
            <a class="button dccr-button" href="<?php echo esc_url(Admin::url()); ?>"><?php esc_html_e('Cancel', 'dcc-ragusa'); ?></a>
        </div>
    </div>
</div>
