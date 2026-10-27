# Manufacturing Business Manager: Windows 10 / 11 version

Same app as the Android version (quotation calculator, purchase orders, reminders, PIN lock, PDF/CSV/JSON export, orange and black theme), packaged as a normal Windows program. It works fully offline and keeps your records on this computer.

## Get the installer (no programming tools on your laptop)

Use the same GitHub route as the Android app.

1. Create a **new private repository** on GitHub, for example `manufacturing-business-manager-windows`.
2. Extract this ZIP, open the `mbm-windows-project` folder and upload **its contents** (including the hidden `.github` folder) to the repository's `main` branch.
3. Open the **Actions** tab, choose **Build Manufacturing Business Manager for Windows**, click **Run workflow**.
4. When it shows a green tick, open the run and download the artifact **Manufacturing-Business-Manager-Windows**. Extract it:
   - `MBM-Windows-Setup-1.4.0.exe`: the installer (recommended)
   - `MBM-Windows-Portable-1.4.0.exe`: runs without installing (cannot open the sync firewall port by itself)

Or build on a Windows PC with Node.js 22 LTS: double-click `build-windows.bat`.

Do not upload customer records to the repository. Upload only this source project.

## Install

Run the Setup file and approve the administrator prompt (it adds one Windows Firewall rule for sync, local network only). Because the installer is not code-signed, Windows may show "Windows protected your PC": click **More info**, then **Run anyway**.

## Reminders (alarms)

- Reminders are Windows notifications at the bottom right of the screen, with the same rules as the phone app (3 days for active POs, 30 days for completed-but-unpaid, 9:00 AM for payments, overdue items again each day at 9:00 AM, plus a 9:00 AM daily summary).
- **Closing the window does not stop them.** The app keeps running in the system tray (near the clock). Right-click the tray icon, then **Quit** to close it completely. After Quit there are no reminders.
- The app starts with Windows (hidden in the tray) so reminders work after a restart. Turn this off in the tray menu: **Start with Windows**.
- If the laptop was off at the reminder time, the reminder appears when it starts again.
- If nothing appears: Windows Settings, System, Notifications, make sure they are on, and turn off Focus assist / Do not disturb. Then use Settings, Reminders, **Send a test notification** in the app.
- Clicking a notification opens that purchase order.

## Sync with your phones

Settings, **Sync with another phone or computer**. It uses the same pairing code and the same sync as the phone app, so the laptop and phones can sync with each other.

1. On the laptop click **Make a code**, then **Turn on sync**.
2. On each phone open Settings and type the same code, then **Turn on sync**.
3. Same Wi-Fi, or a phone hotspot that the laptop joins. No internet needed. Keep the app running on both (the laptop one can sit in the tray).

Public Wi-Fi that blocks devices from seeing each other will stop it. In that case type the other device's address under Settings.

Keep Windows date and time on automatic: the newest edit wins using the clock.

## Delivery challan (new)

Dashboard, **New Delivery Challan**. The challan number is picked for you (series `26/32`: the first two digits are the year and change to 27 from 1 April 2027; the running number starts again from 1 in the new financial year). You fill in the date, customer, address, items with quantity, the note (RETURNABLE BASIS) and, if you want, the transporter. **Save and Download PDF** gives one A4 page with both copies in your format (customer copy and transporter copy).

- The customer address is filled in from your last challan to the same customer.
- The first number is 26/32. If 26/31 was not issued yet, or you issued more on paper, change it under Saved Challans, Challan numbering.
- **Copy to new challan** repeats an old challan with a new number. Deleting the newest challan frees its number.

## Attendance and salary (new)

- **Employees:** add each person with joining date and monthly salary (and a last working day if they leave).
- **Mark Attendance:** pick a day (today by default), tap **Present**, **Half day** or **Absent** for each employee. Tap again to clear. Saved at once.
- **Employee Sheets:** the yearly sheet from your Excel file, one per employee. Click a day to cycle empty, P, H, A.
- **Monthly Salary:** worked out automatically for any month on **26 working days**. Salary per day = monthly salary ÷ 26. Payable days = present days + half of half days, never more than 26. **Monday is the weekly holiday** (you can change the day on the same screen) and is not counted; if someone works on the holiday it is paid as an extra day (you can switch that off too). Add bonus or advance per employee, then download the salary sheet (PDF) or Excel (CSV).
- Days before joining and after the last working day are not counted. Unmarked working days count as absent and are flagged.
- If you set a PIN, it also protects employees, sheets and salary.
- Challans, employees and attendance are included in the backup file and in the automatic safety copy. They are not synced to phones (the phone app does not have these screens).

## GST Filing (new)

Dashboard, **GST Filing** (also in the left menu). Two tabs: **Sales Invoices (B2B)** and **Purchase Invoices (Inward)**.

- Enter invoices one by one: date, invoice no, party GSTIN, taxable value and rate. CGST + SGST (same state as your GSTIN) or IGST (other state) and the total are worked out for you. The next sales invoice number is suggested.
- Each invoice has an **Include in return of** month, so an older invoice can go into a later month's return.
- Each month has its own list with totals. Checks warn about duplicate numbers, GSTINs that look wrong, totals that do not add up and missing numbers in your sales series.
- Download the month as **PDF** (Spark Tech format), **Excel** (with formulas) or **CSV** (same column headings as the GST portal files). Names look like `09_GSTR1_SALES_SEP_2026.pdf` and `09_GSTR2_PURCHASE_SEP_2026.csv`.
- Your GSTIN and business name are at the bottom of the screen (default 27EFDPP0716L1Z9).
- GST invoices are included in the backup file. They are not synced to phones.

## Yearly business report (new)

Settings, **Yearly business report (PO based)**: pick the financial year (April to March), company name and prepared by, then download as PDF or Excel. Use it at the end of March.

## Dashboard amounts

Amounts on the dashboard show only the first digit followed by XX. Press the **eye** button in front of an amount to see it; press again to hide it (it hides by itself after 30 seconds).

## Attendance

Every employee row on Mark Attendance has an orange **Monthly Sheet** button that opens that employee's own sheet.

## Moving your existing phone data to the laptop

Either turn on sync as above (everything copies across), or on the phone use Settings, **Download restore file (JSON)**, copy the file to the laptop, then on the laptop use Settings, **Restore from a backup file**.

## Where data lives and backups

- Records: `%APPDATA%\Manufacturing Business Manager`. Uninstalling the app keeps this folder.
- **Automatic safety copy:** after changes, a restore file is written to `Documents\Manufacturing Business Manager Backups` (`latest-auto-backup.json`, plus one file per day, last 14 kept). It restores with Settings, **Restore from a backup file**. Copy this folder to a USB drive or cloud drive now and then.
- CSV exports open correctly in Excel (₹ sign and accents included).
- Backups and exports use **Save as** windows, so you choose the folder.

## Built from

- `app/`: the same web app as the Android project (`index.html`, `lan-sync.js`, `pdf-lists.js`), with Android wording changed to Windows
- `app/desktop-reminders.js`, `app/desktop-backup.js`: reminder scheduling and safety copy
- `main.js`, `preload.js`: Windows shell (window, tray, notifications, Save as, start with Windows)
- `lansync.js`: sync over the local network, same wire format as the Android plugin
- `reminders.js`: reminder clock that keeps running in the tray
- `test/`: automatic checks (`npm test`) for the reminder clock and the phone/laptop sync format

Windows 10 and 11, 64-bit.

## Look and feel

- **Top bar:** the 3-line button (left) slides the menu in from the left; next to it is the dark / light switch. The Spark Tech logo is at the top right.
- **Dark mode** is a night glass look. **Light mode** is a soft warm beige with an orange glow.
- **Dashboard** is a bento grid: Quick start buttons, reminders, attendance today, summary counts, a 6-month purchase order chart and follow-ups.
- **Amounts on the dashboard are hidden** and show only the first digit followed by XX (for example ₹5XX). Full amounts are still visible inside the quotation and purchase order screens.
- Save buttons stay at the bottom of long forms.
