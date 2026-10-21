<?php
/**
 * The ledger screen: header, period control, tabs.
 *
 * @var string $tab
 * @var array  $period
 * @var array|null $notice
 */

use DCCL\Admin;
use DCCL\Cottages;
use DCCL\Mphb_Reader;
use DCCL\Reports;
use DCCL\Ui;

if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="wrap dccl">
    <h1 class="dccl-title"><?php esc_html_e('DCC Ledger', 'dcc-ledger'); ?></h1>
    <p class="dccl-lede">
        <?php esc_html_e('One money history for the eight cottages: what guests paid, what the platforms took, what the taxes were, and what reached the bank.', 'dcc-ledger'); ?>
    </p>

    <?php
    // A missing MotoPress key is shown instead of figures, never as a zero.
    echo $health;
    // A stale link changes no figure, so it is shown beside them, not instead.
    echo DCCL\Health::bad_links_notice();
    ?>

    <?php if ($notice !== null) : ?>
        <div class="dccl-notice dccl-notice--<?php echo esc_attr($notice['type']); ?>">
            <p><?php echo esc_html($notice['text']); ?></p>
        </div>
    <?php endif; ?>

    <nav class="dccl-tabs" aria-label="<?php esc_attr_e('Ledger Sections', 'dcc-ledger'); ?>">
        <?php foreach (Admin::tab_labels() as $slug => $label) : ?>
            <a class="dccl-tab<?php echo $tab === $slug ? ' is-active' : ''; ?>"
               <?php echo $tab === $slug ? 'aria-current="page"' : ''; ?>
               href="<?php echo esc_url(Admin::url([
                   'tab'    => $slug,
                   'period' => 'custom',
                   'from'   => $period['from'],
                   'to'     => $period['to'],
                   'basis'  => $period['basis'],
                   'view'   => $period['view'],
               ])); ?>"><?php echo esc_html($label); ?></a>
        <?php endforeach; ?>
    </nav>

    <?php if (in_array($tab, ['overview', 'cottage', 'channel', 'stays'], true)) : ?>
        <form class="dccl-period" method="get" action="<?php echo esc_url(admin_url('admin.php')); ?>">
            <input type="hidden" name="page" value="<?php echo esc_attr(Admin::SLUG); ?>">
            <input type="hidden" name="tab" value="<?php echo esc_attr($tab); ?>">

            <fieldset class="dccl-field">
                <legend><?php esc_html_e('Period', 'dcc-ledger'); ?></legend>
                <select name="period" id="dccl-period-kind" aria-label="<?php esc_attr_e('Period Type', 'dcc-ledger'); ?>">
                    <?php
                    $kinds = [
                        'month'  => __('Month', 'dcc-ledger'),
                        'season' => __('Season', 'dcc-ledger'),
                        'year'   => __('Year', 'dcc-ledger'),
                        'custom' => __('Custom', 'dcc-ledger'),
                    ];
                    foreach ($kinds as $value => $label) :
                        ?>
                        <option value="<?php echo esc_attr($value); ?>" <?php selected($period['kind'], $value); ?>>
                            <?php echo esc_html($label); ?>
                        </option>
                    <?php endforeach; ?>
                </select>

                <select name="value" aria-label="<?php esc_attr_e('Period Value', 'dcc-ledger'); ?>">
                    <option value=""><?php esc_html_e('— Choose —', 'dcc-ledger'); ?></option>
                    <optgroup label="<?php esc_attr_e('Months', 'dcc-ledger'); ?>">
                        <?php foreach (Ui::month_options() as $month) : ?>
                            <option value="<?php echo esc_attr($month); ?>"><?php echo esc_html($month); ?></option>
                        <?php endforeach; ?>
                    </optgroup>
                    <optgroup label="<?php esc_attr_e('Years', 'dcc-ledger'); ?>">
                        <?php foreach (Ui::year_options() as $year) : ?>
                            <option value="<?php echo esc_attr($year); ?>"><?php echo esc_html($year); ?></option>
                        <?php endforeach; ?>
                    </optgroup>
                    <optgroup label="<?php esc_attr_e('Seasons', 'dcc-ledger'); ?>">
                        <?php foreach (Mphb_Reader::seasons() as $season) : ?>
                            <option value="<?php echo esc_attr((string) $season['id']); ?>">
                                <?php echo esc_html($season['name']); ?>
                            </option>
                        <?php endforeach; ?>
                    </optgroup>
                </select>

                <label class="dccl-inline">
                    <span><?php esc_html_e('From', 'dcc-ledger'); ?></span>
                    <input type="date" name="from" value="<?php echo esc_attr($period['from']); ?>">
                </label>
                <label class="dccl-inline">
                    <span><?php esc_html_e('To', 'dcc-ledger'); ?></span>
                    <input type="date" name="to" value="<?php echo esc_attr($period['to']); ?>">
                </label>
            </fieldset>

            <fieldset class="dccl-segmented">
                <legend><?php esc_html_e('Count Money', 'dcc-ledger'); ?></legend>
                <label>
                    <input type="radio" name="basis" value="stay" <?php checked($period['basis'], 'stay'); ?>>
                    <span><?php esc_html_e('By Stay Dates', 'dcc-ledger'); ?></span>
                </label>
                <label>
                    <input type="radio" name="basis" value="payout" <?php checked($period['basis'], 'payout'); ?>>
                    <span><?php esc_html_e('By Payout Date', 'dcc-ledger'); ?></span>
                </label>
            </fieldset>

            <fieldset class="dccl-segmented">
                <legend><?php esc_html_e('Direct Bookings', 'dcc-ledger'); ?></legend>
                <?php
                $views = [
                    'original'   => __('Original', 'dcc-ledger'),
                    'ledger'     => __('Ledger', 'dcc-ledger'),
                    'difference' => __('Difference', 'dcc-ledger'),
                ];
                foreach ($views as $value => $label) :
                    ?>
                    <label>
                        <input type="radio" name="view" value="<?php echo esc_attr($value); ?>" <?php checked($period['view'], $value); ?>>
                        <span><?php echo esc_html($label); ?></span>
                    </label>
                <?php endforeach; ?>
            </fieldset>

            <button type="submit" class="button button-primary"><?php esc_html_e('Show', 'dcc-ledger'); ?></button>
        </form>

        <p class="dccl-period-summary">
            <?php
            printf(
                /* translators: 1: period label, 2: start date, 3: end date */
                esc_html__('Showing %1$s (%2$s to %3$s).', 'dcc-ledger'),
                esc_html($period['label']),
                esc_html($period['from']),
                esc_html($period['to'])
            );
            ?>
            <?php echo Ui::chip(
                $period['basis'] === 'payout'
                    ? __('By Payout Date', 'dcc-ledger')
                    : __('By Stay Dates', 'dcc-ledger')
            ); ?>
            <?php
            $view_chips = [
                'original'   => __('Original Only', 'dcc-ledger'),
                'ledger'     => __('Ledger: Original Plus Corrections', 'dcc-ledger'),
                'difference' => __('The Corrections Alone', 'dcc-ledger'),
            ];
            echo Ui::chip($view_chips[$period['view']], $period['view'] === 'original' ? 'muted' : '');
            ?>
            <?php echo Ui::chip(
                sprintf(
                    /* translators: %s: the last date Rob reconciled against the platform exports */
                    __('Reconciled Through %s', 'dcc-ledger'),
                    Cottages::RECONCILED_THROUGH
                ),
                'muted'
            ); ?>
        </p>
    <?php endif; ?>

    <div class="dccl-panel">
        <?php
        $view = DCCL_DIR . 'includes/admin/views/' . $tab . '.php';
        if (is_readable($view)) {
            include $view;
        }
        ?>
    </div>
</div>
