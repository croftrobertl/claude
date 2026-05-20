const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    js.configs.recommended,
    {
        files: ['mphb-availability-calendar/assets/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'script',
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            // Unused function parameters are intentional in some callbacks.
            'no-unused-vars': ['warn', { args: 'none' }],
        },
    },
];
