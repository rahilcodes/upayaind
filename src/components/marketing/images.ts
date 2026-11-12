/**
 * Marketing image slots (D-148). Each slot renders through <ImageSlot id="…">:
 * with `src` set it is a real <Image>; without one it shows a visible dashed
 * placeholder carrying the slot id and the recommended size, so the client can
 * produce artwork and drop it in as public/images/<id>.<ext>, then set `src`
 * here. public/images/README.md lists every slot and where it appears.
 */
export type ImageSlotDef = { src?: string; alt: string; size: string; note: string; where: string };

const portrait = (country: string, where: string): ImageSlotDef => ({ alt: "Photo of the reviewer", size: "240×240 (1:1)", note: `Portrait, ${country}`, where });

export const MARKETING_IMAGES = {
  "hero-side": { src: "/images/hero-side.webp", alt: "Three young professionals working side by side on laptops in a bright office", size: "960×640 (3:2)", note: "Warm photo: specialist and applicant, laptop, bright office", where: "Country homepages — hero, under the dashboard mock" },
  "who-banner": { src: "/images/who-banner.webp", alt: "A team of professionals around a meeting table with a laptop", size: "1600×600 (8:3)", note: "Wide banner: fresher, experienced professional, career returner", where: "Country homepages — Who it's for" },
  "step-1": { src: "/images/step-1.webp", alt: "Hands typing on a laptop next to an open notebook and phone", size: "640×400 (16:10)", note: "Illustration: onboarding form / resume upload", where: "Country homepages — How it works, step 1" },
  "step-2": { src: "/images/step-2.webp", alt: "A printed cover letter and pen on a desk beside a newspaper jobs page", size: "640×400 (16:10)", note: "Illustration: clean resume document with ticks", where: "Country homepages — How it works, step 2" },
  "step-3": { src: "/images/step-3.webp", alt: "A person browsing company listings on a laptop at a desk", size: "640×400 (16:10)", note: "Illustration: job portals, daily applications", where: "Country homepages — How it works, step 3" },
  "step-4": { src: "/images/step-4.webp", alt: "A man on a video call on his tablet with headphones beside him", size: "640×400 (16:10)", note: "Illustration: video interview and live tracker", where: "Country homepages — How it works, step 4" },
  "portals-side": { src: "/images/portals-side.webp", alt: "A man scrolling through job listings on a laptop in an office", size: "800×600 (4:3)", note: "Photo or illustration: Naukri / LinkedIn / Indeed listings", where: "Country homepages — Where we apply" },
  "team-1": { src: "/images/team-1.webp", alt: "Colleagues working on laptops around a shared desk", size: "800×600 (4:3)", note: "Team photo: specialists at desks", where: "Country homepages and About — Life at UpayaInd gallery" },
  "team-2": { src: "/images/team-2.webp", alt: "Three colleagues discussing notes and a laptop in a meeting room", size: "800×600 (4:3)", note: "Team photo: stand-up / whiteboard", where: "Country homepages and About — Life at UpayaInd gallery" },
  "team-3": { src: "/images/team-3.webp", alt: "Two colleagues talking in an office while one checks her phone", size: "800×600 (4:3)", note: "Photo: mock interview / coaching call", where: "Country homepages and About — Life at UpayaInd gallery" },
  "poster-looking-for-job": { src: "/images/poster-looking-for-job.webp", alt: "A smiling professional with crossed arms in a modern office", size: "900×1000 (9:10)", note: "From the client poster: two professionals in business attire on a light blue background", where: "Country homepages — Looking for a job? promo banner" },
  "about-hero": { src: "/images/about-hero.webp", alt: "A team meeting in a glass-walled modern office", size: "1200×700 (12:7)", note: "Photo: office exterior or main workspace", where: "About page — hero" },
  "contact-office-in": { src: "/images/contact-office-in.webp", alt: "A modern glass office tower in Hyderabad", size: "800×500 (16:10)", note: "Photo: Hyderabad office, Kondapur", where: "Contact page — offices (India)" },
  "contact-office-us": { src: "/images/contact-office-us.webp", alt: "The entrance of a downtown office building in the evening", size: "800×500 (16:10)", note: "Photo: Erie PA office", where: "Contact page — offices (United States)" },
  "testimonial-in-1": portrait("India", "Testimonials (India)"),
  "testimonial-in-2": portrait("India", "Testimonials (India)"),
  "testimonial-in-3": portrait("India", "Testimonials (India)"),
  "testimonial-in-4": portrait("India", "Testimonials (India)"),
  "testimonial-in-5": portrait("India", "Testimonials (India)"),
  "testimonial-in-6": portrait("India", "Testimonials (India)"),
  "testimonial-us-1": portrait("United States", "Testimonials (United States)"),
  "testimonial-us-2": portrait("United States", "Testimonials (United States)"),
  "testimonial-us-3": portrait("United States", "Testimonials (United States)"),
  "testimonial-us-4": portrait("United States", "Testimonials (United States)"),
  "testimonial-us-5": portrait("United States", "Testimonials (United States)"),
  "testimonial-uk-1": portrait("United Kingdom", "Testimonials (United Kingdom)"),
  "testimonial-uk-2": portrait("United Kingdom", "Testimonials (United Kingdom)"),
  "testimonial-uk-3": portrait("United Kingdom", "Testimonials (United Kingdom)"),
  "testimonial-uk-4": portrait("United Kingdom", "Testimonials (United Kingdom)"),
  "testimonial-ca-1": portrait("Canada", "Testimonials (Canada)"),
  "testimonial-ca-2": portrait("Canada", "Testimonials (Canada)"),
  "testimonial-ca-3": portrait("Canada", "Testimonials (Canada)"),
  "testimonial-ca-4": portrait("Canada", "Testimonials (Canada)"),
  "testimonial-au-1": portrait("Australia", "Testimonials (Australia)"),
  "testimonial-au-2": portrait("Australia", "Testimonials (Australia)"),
  "testimonial-au-3": portrait("Australia", "Testimonials (Australia)"),
  "testimonial-au-4": portrait("Australia", "Testimonials (Australia)"),
  "testimonial-nz-1": portrait("New Zealand", "Testimonials (New Zealand)"),
  "testimonial-nz-2": portrait("New Zealand", "Testimonials (New Zealand)"),
  "testimonial-nz-3": portrait("New Zealand", "Testimonials (New Zealand)"),
  "testimonial-nz-4": portrait("New Zealand", "Testimonials (New Zealand)"),
} satisfies Record<string, ImageSlotDef>;

export type ImageSlotId = keyof typeof MARKETING_IMAGES;

export function imageSlot(id: string): ImageSlotDef | null {
  return (MARKETING_IMAGES as Record<string, ImageSlotDef>)[id] ?? null;
}
