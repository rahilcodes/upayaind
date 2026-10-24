# Marketing image slots

Every placeholder on the public site is an **image slot** defined in
`src/components/marketing/images.ts`. Until a slot has a `src`, the site shows a
dashed "Image coming soon" box with the slot id and the recommended size.

To fill a slot:

1. Export the artwork at the size below (or larger, same ratio) as JPG/WebP/PNG.
2. Save it here as `public/images/<slot-id>.<ext>` (e.g. `public/images/hero-side.webp`).
3. In `src/components/marketing/images.ts` add `src: "/images/<slot-id>.<ext>"` to that slot (and adjust `alt` if needed).

| Slot id | Size (ratio) | Where it appears | Brief |
| --- | --- | --- | --- |
| `hero-side` | 960×640 (3:2) | Country homepages — hero, under the dashboard mock | Specialist and applicant reviewing a tailored resume, bright office |
| `who-banner` | 1600×600 (8:3) | Country homepages — "Who it's for" | Wide banner: fresher, experienced professional, career returner |
| `step-1` | 640×400 (16:10) | Country homepages — How it works, step 1 | Onboarding form / resume upload |
| `step-2` | 640×400 (16:10) | Country homepages — How it works, step 2 | Clean master resume with ticks |
| `step-3` | 640×400 (16:10) | Country homepages — How it works, step 3 | Job portals, daily applications |
| `step-4` | 640×400 (16:10) | Country homepages — How it works, step 4 | Video interview + live tracker |
| `portals-side` | 800×600 (4:3) | Country homepages — "Where we apply" | Job portal listings on a laptop |
| `team-1` | 800×600 (4:3) | Country homepages + About — Life at UpayaInd | Specialists at desks |
| `team-2` | 800×600 (4:3) | Country homepages + About — Life at UpayaInd | Stand-up / whiteboard |
| `team-3` | 800×600 (4:3) | Country homepages + About — Life at UpayaInd | Mock interview / coaching call |
| `poster-looking-for-job` | 900×1000 (9:10) | Country homepages — "Looking for a job?" banner | The two professionals from the client poster |
| `about-hero` | 1200×700 (12:7) | About page — hero | Office exterior or main workspace |
| `contact-office-in` | 800×500 (16:10) | Contact page — offices (India) | Hyderabad office |
| `contact-office-us` | 800×500 (16:10) | Contact page — offices (United States) | Erie, PA office |
| `testimonial-in-1` … `testimonial-in-6` | 240×240 (1:1) | Testimonials on the India homepage | Reviewer portraits |
| `testimonial-us-1` … `testimonial-us-5` | 240×240 (1:1) | Testimonials on the US homepage | Reviewer portraits |
| `testimonial-uk-1` … `testimonial-uk-4` | 240×240 (1:1) | Testimonials on the UK homepage | Reviewer portraits |

Company logos for the "placed at" marquee live in `public/brand/companies/`
(`node scripts/gen-company-logos.mjs` regenerates the icon set).

The testimonials themselves are in `src/i18n/messages/en/marketing.json`
(`marketing.testimonials.items`) and are marked `placeholder: true` — replace
them with real, permissioned reviews before launch.
