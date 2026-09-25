<?php
/**
 * Just enough Elementor to load and interrogate the four widget classes.
 *
 * `Widget_Base::add_control()` RECORDS instead of rendering, so a test can ask
 * a widget what controls it registers, what type each one is, and what default
 * it carries — which is the only way to prove "an untouched control writes
 * nothing" and "a boolean override can express inherit".
 *
 * NOT shipped: tools/ is excluded from the release zip.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

namespace Elementor;

class Controls_Manager {
	const TEXT        = 'text';
	const TEXTAREA    = 'textarea';
	const NUMBER      = 'number';
	const SWITCHER    = 'switcher';
	const SELECT      = 'select';
	const SELECT2     = 'select2';
	const CHOOSE      = 'choose';
	const COLOR       = 'color';
	const SLIDER      = 'slider';
	const HEADING     = 'heading';
	const RAW_HTML    = 'raw_html';
	const DIVIDER     = 'divider';
	const HIDDEN      = 'hidden';
	const TAB_CONTENT = 'content';
	const TAB_STYLE   = 'style';
	const TAB_ADVANCED = 'advanced';
}

class Widget_Base {
	/** @var array<string,mixed> */
	public array $recorded_controls = [];
	/** @var array<int,array<string,mixed>> */
	public array $recorded_sections = [];
	/** @var array<string,mixed> */
	public array $fake_settings = [];

	private string $current_section = '';

	public function __construct( $data = [], $args = null ) {}

	public function start_controls_section( $id, $args = [] ): void {
		$this->current_section = (string) $id;
		$this->recorded_sections[] = [ 'id' => (string) $id ] + (array) $args;
	}

	public function end_controls_section(): void {
		$this->current_section = '';
	}

	public function start_controls_tabs( $id, $args = [] ): void {}
	public function end_controls_tabs(): void {}
	public function start_controls_tab( $id, $args = [] ): void {}
	public function end_controls_tab(): void {}

	public function add_control( $id, $args = [], $options = [] ): void {
		$this->recorded_controls[ (string) $id ] = (array) $args + [ '_section' => $this->current_section ];
	}

	public function add_responsive_control( $id, $args = [], $options = [] ): void {
		$this->add_control( $id, $args, $options );
	}

	public function add_group_control( $group, $args = [] ): void {}

	/** @return array<string,mixed> */
	public function get_settings_for_display( $setting = null ) {
		if ( null !== $setting ) {
			return $this->fake_settings[ $setting ] ?? '';
		}
		return $this->fake_settings;
	}

	/** @return array<string,mixed> */
	public function get_settings( $setting = null ) {
		return $this->get_settings_for_display( $setting );
	}

	public function get_name(): string { return 'stub'; }
	public function get_title(): string { return 'Stub'; }
	public function get_icon(): string { return 'eicon-cog'; }
	/** @return string[] */
	public function get_categories(): array { return []; }
	/** @return string[] */
	public function get_keywords(): array { return []; }
	public function get_id(): string { return 'stubid'; }
	protected function register_controls(): void {}
	protected function content_template(): void {}
	protected function render(): void {}

	/** Drive control registration from a test. */
	public function dccwl_register_controls_for_test(): void {
		$m = new \ReflectionMethod( $this, 'register_controls' );
		$m->setAccessible( true );
		$m->invoke( $this );
	}
}

namespace Elementor\Core\Kits\Documents\Tabs;

class Global_Colors {}
