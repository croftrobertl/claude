<?php
/**
 * The Ragusa page: one sentence, five cards, recent events, standing
 * advice, settings.
 *
 * @var string $notice
 * @var string $kind
 */

use DCCR\Actions;
use DCCR\Admin;
use DCCR\Alerts;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\Heartbeat;
use DCCR\Journal;
use DCCR\Settings;
use DCCR\Site;
use DCCR\State;
use DCCR\Vault;

if (!defined('ABSPATH')) {
    exit;
}

$settings = Settings::get();
$amber    = Settings::notices();
if (Settings::secrets_unreadable()) {
    $amber[] = __('The stored heartbeat URL and feed key cannot be read any more (the vault key changed). Paste them again below.', 'dcc-ragusa');
}
if (!Site::is_live()) {
    /* translators: %s: role */
    $amber[] = sprintf(__('This is the %s site: Ragusa sends no email and no heartbeat here unless a command asks.', 'dcc-ragusa'), Site::role());
}
if ((bool) State::get('vault_in_web_root', false)) {
    $amber[] = __('The vault is inside the web root because no home directory was writable. It is denied to the web, but ask the site director.', 'dcc-ragusa');
}
if (!Admin::zelenci_installed()) {
    $amber[] = __('Zelenci is not installed. The site director installs it with: wp ragusa zelenci install', 'dcc-ragusa');
}
$overall = Fortress::overall();
$icons   = [Fortress::HOLDING => '✓', Fortress::NEEDS_LOOK => '!', Fortress::BREACHED => '✕', Fortress::UNKNOWN => '…'];
$alerts  = Alerts::active();
?>
<div class="wrap dccr">
    <h1 class="dccr-title"><?php esc_html_e('Ragusa', 'dcc-ragusa'); ?></h1>
    <p class="dccr-overall dccr-overall--<?php echo esc_attr(str_contains($overall, 'Breached') ? 'bad' : (str_contains($overall, 'Needs') ? 'warn' : 'good')); ?>">
        <?php echo esc_html($overall); ?>
    </p>

    <?php if ($notice !== '') : ?>
        <div class="dccr-notice dccr-notice--<?php echo esc_attr($kind); ?>"><p><?php echo esc_html($notice); ?></p></div>
    <?php endif; ?>
    <?php foreach ($amber as $line) : ?>
        <div class="dccr-notice dccr-notice--warn"><p><?php echo esc_html($line); ?></p></div>
    <?php endforeach; ?>

    <div class="dccr-actions">
        <?php echo Admin::form('check_now', [], __('Check Now', 'dcc-ragusa'), 'button button-primary dccr-button'); ?>
        <span class="dccr-muted">
            <?php
            $hb = Heartbeat::last();
            if (!Heartbeat::configured()) {
                esc_html_e('Heartbeat: not set', 'dcc-ragusa');
            } elseif (($hb['ts'] ?? 0) > 0) {
                /* translators: 1: result, 2: relative time */
                echo esc_html(sprintf(__('Heartbeat: %1$s %2$s', 'dcc-ragusa'), (string) ($hb['result'] ?? ''), Site::ago((int) $hb['ts'])));
            } else {
                esc_html_e('Heartbeat: set, not yet sent', 'dcc-ragusa');
            }
            ?>
        </span>
    </div>

    <div class="dccr-cards">
        <?php foreach (Fortress::all() as $slug) : ?>
            <?php
            $status   = Fortress::status($slug);
            $state    = $status['state'];
            $findings = array_filter($alerts, static fn($a) => ($a['fortress'] ?? '') === $slug);
            include DCCR_DIR . 'includes/views/card.php';
            ?>
        <?php endforeach; ?>
        <?php
        // Zelenci, the sentinel.
        $z_installed = Admin::zelenci_installed();
        ?>
        <section class="dccr-card dccr-card--<?php echo $z_installed ? 'good' : 'warn'; ?>" aria-labelledby="dccr-card-zelenci">
            <p class="dccr-card__state"><span class="dccr-card__icon" aria-hidden="true"><?php echo $z_installed ? '✓' : '!'; ?></span> <?php echo esc_html($z_installed ? __('Holding', 'dcc-ragusa') : __('Not Installed', 'dcc-ragusa')); ?></p>
            <h2 class="dccr-card__name" id="dccr-card-zelenci"><?php echo esc_html(Fortress::name(Fortress::ZELENCI)); ?></h2>
            <p class="dccr-card__sub"><?php echo esc_html(Fortress::subtitle(Fortress::ZELENCI)); ?></p>
            <p class="dccr-card__line"><?php echo $z_installed ? esc_html__('Rings If Ragusa Is Switched Off Or Removed', 'dcc-ragusa') : esc_html__('Install It From The Command Line', 'dcc-ragusa'); ?></p>
            <p class="dccr-card__when"><?php echo $z_installed ? esc_html__('A Must-Use Plugin; It Cannot Be Deactivated From The Plugins Screen', 'dcc-ragusa') : '<code>wp ragusa zelenci install</code>'; ?></p>
        </section>
    </div>

    <h2 class="dccr-h2"><?php esc_html_e('Recent Events', 'dcc-ragusa'); ?></h2>
    <?php $events = Events::recent(20, 0, true); ?>
    <?php if ($events === []) : ?>
        <p class="dccr-empty"><?php esc_html_e('Nothing has happened yet. The first cron tick takes the baselines.', 'dcc-ragusa'); ?></p>
    <?php else : ?>
        <ul class="dccr-events">
            <?php foreach ($events as $ev) : ?>
                <?php
                $row  = !empty($ev['journal_id']) ? Journal::get((int) $ev['journal_id']) : null;
                $undo = $row !== null && isset(Actions::MAP[$row['action']]) && $row['state'] === Journal::COMMITTED && $row['reversible'];
                ?>
                <?php $practice = ($ev['tag'] ?? '') === Events::TAG_DRILL; ?>
                <li class="dccr-event dccr-event--<?php echo esc_attr($practice ? 'practice' : (string) $ev['severity']); ?>">
                    <p class="dccr-event__meta">
                        <?php if ($practice) : ?><span class="dccr-tag"><?php esc_html_e('Practice', 'dcc-ragusa'); ?></span> <?php endif; ?>
                        <?php echo esc_html(Site::when((int) $ev['ts'])); ?> · <?php echo esc_html(Fortress::name((string) $ev['fortress'])); ?>
                        <?php if (($ev['tag'] ?? '') === Events::TAG_WITHDRAWN) : ?> · <?php esc_html_e('Withdrawn', 'dcc-ragusa'); ?><?php endif; ?>
                    </p>
                    <p class="dccr-event__text"><?php echo esc_html((string) $ev['message']); ?></p>
                    <p class="dccr-event__undo">
                        <?php if ($undo) : ?>
                            <?php esc_html_e('Can Be Undone', 'dcc-ragusa'); ?>
                            <?php echo Admin::form('restore', ['target' => (string) $row['id']], __('Undo', 'dcc-ragusa'), 'button dccr-button'); ?>
                        <?php elseif ($row !== null && $row['state'] === Journal::REVERSED) : ?>
                            <?php esc_html_e('Undone', 'dcc-ragusa'); ?>
                        <?php else : ?>
                            <?php esc_html_e('Nothing To Undo', 'dcc-ragusa'); ?>
                        <?php endif; ?>
                    </p>
                </li>
            <?php endforeach; ?>
        </ul>
        <p class="dccr-muted">
            <?php
            /* translators: %d: events kept */
            echo esc_html(sprintf(__('The last %d events are kept. The command line shows more: wp ragusa journal', 'dcc-ragusa'), Events::RING));
            ?>
        </p>
    <?php endif; ?>

    <div class="dccr-two">
        <section>
            <h2 class="dccr-h2"><?php esc_html_e('Standing Advice', 'dcc-ragusa'); ?></h2>
            <p class="dccr-note"><?php esc_html_e('From the site director\'s audit. Ragusa never acts on these.', 'dcc-ragusa'); ?></p>
            <ul class="dccr-advice">
                <?php foreach (array_merge(Admin::standing_advice(), Admin::housekeeping()) as $line) : ?>
                    <li><?php echo esc_html($line); ?></li>
                <?php endforeach; ?>
            </ul>
        </section>

        <section>
            <h2 class="dccr-h2"><?php esc_html_e('Settings', 'dcc-ragusa'); ?></h2>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="dccr-settings">
                <input type="hidden" name="action" value="dccr_save_settings">
                <?php wp_nonce_field(Admin::NONCE, '_dccr_nonce'); ?>

                <label class="dccr-field" for="dccr-alert-email">
                    <span><?php esc_html_e('Alert Email', 'dcc-ragusa'); ?></span>
                    <input type="email" id="dccr-alert-email" name="alert_email" value="<?php echo esc_attr((string) $settings['alert_email']); ?>" placeholder="<?php echo esc_attr((string) get_option('admin_email', '')); ?>">
                    <small class="dccr-muted"><?php esc_html_e('Empty means the site administrator address.', 'dcc-ragusa'); ?></small>
                </label>

                <label class="dccr-field" for="dccr-heartbeat">
                    <span><?php esc_html_e('Heartbeat URL', 'dcc-ragusa'); ?></span>
                    <?php if ($settings['has_heartbeat']) : ?>
                        <code class="dccr-code"><?php echo esc_html(Settings::mask(Settings::secret('heartbeat_url'))); ?></code>
                    <?php endif; ?>
                    <input type="url" id="dccr-heartbeat" name="heartbeat_url" value="" placeholder="https://hc-ping.com/…" autocomplete="off">
                    <small class="dccr-muted"><?php esc_html_e('From healthchecks.io: Period 1 Hour, Grace 1 Hour. Paste to replace; leave empty to keep.', 'dcc-ragusa'); ?></small>
                    <?php if ($settings['has_heartbeat']) : ?>
                        <label class="dccr-check"><input type="checkbox" name="clear_heartbeat" value="1"> <?php esc_html_e('Remove The Heartbeat URL', 'dcc-ragusa'); ?></label>
                    <?php endif; ?>
                </label>

                <label class="dccr-field" for="dccr-feed-key">
                    <span><?php esc_html_e('Wordfence Intelligence Key', 'dcc-ragusa'); ?></span>
                    <?php if ($settings['has_feed_key']) : ?>
                        <code class="dccr-code"><?php echo esc_html(Settings::mask(Settings::secret('feed_key'))); ?></code>
                    <?php endif; ?>
                    <input type="password" id="dccr-feed-key" name="feed_key" value="" autocomplete="off">
                    <small class="dccr-muted"><?php esc_html_e('Free from a wordfence.com account. Paste to replace; leave empty to keep.', 'dcc-ragusa'); ?></small>
                    <?php if ($settings['has_feed_key']) : ?>
                        <label class="dccr-check"><input type="checkbox" name="clear_feed_key" value="1"> <?php esc_html_e('Remove The Feed Key', 'dcc-ragusa'); ?></label>
                    <?php endif; ?>
                </label>

                <label class="dccr-check dccr-danger-zone">
                    <input type="checkbox" name="delete_on_uninstall" value="1" <?php checked($settings['delete_on_uninstall']); ?>>
                    <?php esc_html_e('Delete Ragusa\'s Data, Journal And Vault When The Plugin Is Deleted', 'dcc-ragusa'); ?>
                </label>

                <p><button type="submit" class="button button-primary dccr-button"><?php esc_html_e('Save', 'dcc-ragusa'); ?></button></p>
            </form>
            <p class="dccr-muted dccr-small">
                <?php
                echo esc_html(sprintf(
                    /* translators: 1: version, 2: site role, 3: vault path */
                    __('Ragusa %1$s · %2$s site · vault at %3$s', 'dcc-ragusa'),
                    DCCR_VERSION,
                    Site::role(),
                    Vault::dir()
                ));
                ?>
            </p>
        </section>
    </div>
</div>
