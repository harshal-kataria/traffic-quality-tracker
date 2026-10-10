# ChasmaKart founder screen

The founder screen is an independent, private surface at `/founder/index.html`. It keeps the store’s established blue, white and pale-blue palette. Its layout serves a readable product-by-source table rather than the storefront’s shopping layout. The current implementation lives in `founder/screen.jsx` and `founder/screen.css`.

## Colours and type

- Page background: `#fafbff`; main text: `#172342`; secondary text: `#56637e`.
- Buttons, source labels and brand dot: `#244bdb`.
- Table heading and period badge background: `#e4edfa`.
- Borders: `#d8dfed`; table row borders: `#e4e9f2`; hovered rows: `#f4f7ff`.
- Error text: `#a02323`; keyboard focus outline: `#ffbc99`, 3px with 3px offset.
- Self-hosted Outfit at weights 400 and 600, with system sans-serif fallback. Main headings are 32px on desktop and 28px on small screens. Table product labels are 17px; notices, table headings and definitions are 14px.
- Numeric cells align right and use equal-width digits to make totals easier to compare.

## Layout and components

The reporting shell is centred, up to 1200px wide, with 36px side padding. The header contains the ChasmaKart brand, founder label and sign-out button. The report title, date range in IST and 30-day badge precede the exclusion notice and table. Definitions follow in two columns. The footer identifies the store and private reporting surface.

The table has a white background, 10px rounded outer border, pale-blue heading and 19px by 22px cell padding. Product names are row headings. Its minimum width is 620px; the wrapper scrolls horizontally when necessary. A hidden caption describes the table for assistive readers. Empty results appear within a full-width table row.

Buttons have 8px corners. The sign-out button uses a transparent background and blue text; primary buttons use blue with white text. Disabled buttons reduce opacity and display a waiting cursor.

## Small screens and states

At widths below 650px, side padding becomes 16px, the title and period badge stack, definitions become one column, and header typography becomes smaller. The table retains its columns through horizontal scrolling.

Sign-in uses a centred panel up to 450px wide, visibly labelled email and password inputs, and a full-width submit button. Inputs support browser autocomplete. Failed sign-in shows a text alert; pending sign-in disables the submit button and changes its label.

Access checking and report loading use status messages. A failed report displays “Numbers are unavailable,” explains that access or loading may be the cause, and offers “Try again.” It does not display partial totals. The report visibly explains page-view counting, product order/value allocation, saved attribution and order exclusions.
