<?php
/**
 * Imports: upload a file, and the batch history with undo.
 *
 * @var array $period
 */

use DCCL\Admin;
use DCCL\Batches;
use DCCL\Importer;
use DCCL\Ui;

if (!defined('ABSPATH')) {
    exit;
}

$batches = Batches::all();
?>
<h2 class="dccl-h2"><?php esc_html_e('Imports', 'dcc-ledger'); ?></h2>

<p class="dccl-note">
    <?php esc_html_e('The file is read in memory and deleted before the page finishes, whether the import works or fails. It is never kept in the uploads folder, and no guest name, email, phone or address is stored from it.', 'dcc-ledger'); ?>
</p>

<form class="dccl-upload" method="post" enctype="multipart/form-data" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
    <?php wp_nonce_field(Admin::NONCE); ?>
    <input type="hidden" name="action" value="dccl_import">

    <label class="dccl-field" for="dccl-file">
        <span><?php esc_html_e('Export File (.csv, Up To 5 MB)', 'dcc-ledger'); ?></span>
        <input type="file" id="dccl-file" name="ledger_file" accept=".csv,text/csv" required>
    </label>

    <label class="dccl-inline">
        <input type="checkbox" name="dry_run" value="1" checked>
        <span><?php esc_html_e('Dry Run — Report The Counts And Write Nothing', 'dcc-ledger'); ?></span>
    </label>

    <button type="submit" class="button button-primary"><?php esc_html_e('Import', 'dcc-ledger'); ?></button>
</form>

<h3 class="dccl-h3"><?php esc_html_e('Formats It Accepts', 'dcc-ledger'); ?></h3>
<p class="dccl-note">
    <?php esc_html_e('The format is worked out from the header row, not the file name. A file whose columns have been edited is refused rather than guessed at.', 'dcc-ledger'); ?>
</p>
<ul class="dccl-chips">
    <?php foreach (Importer::parsers() as $parser) : ?>
        <li><?php echo Ui::chip($parser::label()); ?></li>
    <?php endforeach; ?>
</ul>

<h3 class="dccl-h3"><?php esc_html_e('Import History', 'dcc-ledger'); ?></h3>
<div class="dccl-table-wrap">
    <table class="dccl-table">
        <caption><?php esc_html_e('Every import, with what it read and what it wrote. Undo removes exactly the rows that batch added.', 'dcc-ledger'); ?></caption>
        <thead>
            <tr>
                <th scope="col"><?php esc_html_e('Batch', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('File', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Format', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Read', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Added', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Already There', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Excluded', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Skipped', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('When', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Undo', 'dcc-ledger'); ?></th>
            </tr>
        </thead>
        <tbody>
            <?php if ($batches === []) : ?>
                <tr><td colspan="10"><?php esc_html_e('Nothing imported yet.', 'dcc-ledger'); ?></td></tr>
            <?php endif; ?>
            <?php foreach ($batches as $batch) : ?>
                <?php $undone = Batches::is_undone($batch); ?>
                <tr<?php echo $undone ? ' class="is-undone"' : ''; ?>>
                    <th scope="row">#<?php echo (int) $batch['id']; ?></th>
                    <td><?php echo esc_html((string) $batch['label']); ?></td>
                    <td><?php echo esc_html((string) $batch['kind']); ?></td>
                    <td><?php echo Ui::number($batch['rows_read']); ?></td>
                    <td><?php echo Ui::number($batch['rows_inserted']); ?></td>
                    <td><?php echo Ui::number($batch['rows_unchanged']); ?></td>
                    <td><?php echo Ui::number($batch['rows_excluded']); ?></td>
                    <td><?php echo Ui::number($batch['rows_skipped']); ?></td>
                    <td><?php echo esc_html((string) $batch['created_at']); ?></td>
                    <td>
                        <?php if ($undone) : ?>
                            <?php echo Ui::chip(__('Undone', 'dcc-ledger'), 'muted'); ?>
                        <?php else : ?>
                            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                                <?php wp_nonce_field(Admin::NONCE); ?>
                                <input type="hidden" name="action" value="dccl_undo">
                                <input type="hidden" name="batch_id" value="<?php echo (int) $batch['id']; ?>">
                                <button type="submit" class="button-link dccl-danger"><?php esc_html_e('Undo', 'dcc-ledger'); ?></button>
                            </form>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>

<h3 class="dccl-h3"><?php esc_html_e('Over SSH', 'dcc-ledger'); ?></h3>
<pre class="dccl-code-block">wp dcc-ledger import /path/to/export.csv --dry-run
wp dcc-ledger import /path/to/export.csv
wp dcc-ledger batches
wp dcc-ledger undo 7</pre>
