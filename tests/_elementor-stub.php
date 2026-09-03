<?php
/**
 * Minimal Elementor surface so class-widget.php can be loaded outside
 * WordPress. Only the static, dependency-free methods under test are called,
 * so these stubs cannot influence the behaviour being asserted.
 */
namespace Elementor;

class Widget_Base {}
class Repeater {}
class Controls_Manager {}
class Icons_Manager {}
