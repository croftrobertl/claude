<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

use Elementor\Base_Data_Control;

/**
 * A small custom Elementor control that renders a textarea + action button used to
 * export/import the "text code" between a Cottage Selector and a Mini Entry. The
 * behaviour lives in assets/js/editor-io.js (registered as the `dccs_design_io`
 * control view); this class just provides the panel markup and the control type.
 *
 * It's a data control only so its JS view gets reliable access to the edited
 * widget's container; the stored value itself is incidental.
 */
class Control_Design_IO extends Base_Data_Control
{
    const TYPE = 'dccs_design_io';

    public function get_type(): string
    {
        return self::TYPE;
    }

    protected function get_default_settings(): array
    {
        return [
            'mode'        => 'export',
            'button_text' => '',
            'placeholder' => '',
            'label_block' => true,
        ];
    }

    public function content_template(): void
    {
        ?>
        <div class="elementor-control-field dccs-io" data-mode="{{ data.mode }}">
            <# if ( data.label ) { #><label class="elementor-control-title">{{{ data.label }}}</label><# } #>
            <div class="elementor-control-input-wrapper elementor-control-unit-5">
                <textarea class="dccs-io-code" rows="3" spellcheck="false" placeholder="{{ data.placeholder }}" style="width:100%;font-family:monospace;font-size:11px;"></textarea>
                <button type="button" class="dccs-io-btn elementor-button elementor-button-default" style="margin-top:6px;">{{{ data.button_text }}}</button>
                <span class="dccs-io-status" style="display:block;margin-top:6px;font-size:11px;opacity:.85;"></span>
            </div>
            <# if ( data.description ) { #><div class="elementor-control-field-description">{{{ data.description }}}</div><# } #>
        </div>
        <?php
    }
}
