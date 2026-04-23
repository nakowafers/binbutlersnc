---
trigger: always_on
glob: "**/*.{html,css,js}"
description: Ensures all styling and functional changes are mobile-friendly and do not obstruct content.
---

# Website Compatibility & Mobile Responsiveness

When making any updates to the website's styling or structure, ensure the following rules are followed:

1. **Mobile-First Design**: All changes must be fully responsive and optimized for mobile devices. Use media queries to adjust layouts for smaller screens.
2. **Content Visibility**: Ensure that styling changes (overlays, fixed elements, absolute positioning) do not block or obscure text, images, or critical calls to action (CTAs).
3. **Functional Integrity**: Interactive elements (buttons, links, forms) must remain functional and easily tappable on mobile devices (minimum tap target size of 44x44px).
4. **Legibility**: Maintain high contrast and readable font sizes across all screen dimensions. Hero text and headers should remain clear even with background images or overlays.
5. **Cross-Browser Testing**: Verify that layout changes hold up across different browser engines (WebKit, Blink, Gecko).
