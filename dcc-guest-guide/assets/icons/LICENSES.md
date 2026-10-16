# Bundled icon glyphs

The eight section glyphs shipped in `includes/class-icons.php` (and output as an
inline SVG sprite) are redistributed from two open-source sets. No icon font,
stylesheet or script is fetched from any outside host at runtime: the glyph
paths are compiled into the plugin.

## Phosphor Icons — MIT
Seven glyphs, "Fill" weight: devices, campfire, fish, suitcase-rolling, gavel,
signpost, hand-heart. From https://github.com/phosphor-icons/core

    MIT License
    Copyright (c) 2023 Phosphor Icons

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

## Material Symbols — Apache License 2.0
One glyph, Rounded / filled: `local_laundry_service`, shipped here as
`dccgg-icon-laundry`. From https://github.com/google/material-design-icons

    Copyright 2023 Google LLC

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

The laundry glyph is rendered at 0.90 scale so its visual weight matches the
seven Phosphor glyphs, which are drawn on a different grid.
