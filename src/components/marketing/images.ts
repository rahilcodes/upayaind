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
  "hero-side": { alt: "A UpayaInd specialist reviewing a tailored resume with an applicant", size: "960×640 (3:2)", note: "Warm photo: specialist and applicant, laptop, bright office", where: "Country homepages — hero, under the dashboard mock" },
  "who-banner": { alt: "Job seekers at different career stages", size: "1600×600 (8:3)", note: "Wide banner: fresher, experienced professional, career returner", where: "Country homepages — Who it's for" },
  "step-1": { alt: "Signing up and uploading a resume", size: "640×400 (16:10)", note: "Illustration: onboarding form / resume upload", where: "Country homepages — How it works, step 1" },
  "step-2": { alt: "A structured master resume ready for review", size: "640×400 (16:10)", note: "Illustration: clean resume document with ticks", where: "Country homepages — How it works, step 2" },
  "step-3": { alt: "Specialist applying to jobs on several portals", size: "640×400 (16:10)", note: "Illustration: job portals, daily applications", where: "Country homepages — How it works, step 3" },
  "step-4": { alt: "An applicant in an interview while applications continue", size: "640×400 (16:10)", note: "Illustration: video interview and live tracker", where: "Country homepages — How it works, step 4" },
  "portals-side": { alt: "Job portal listings on a laptop screen", size: "800×600 (4:3)", note: "Photo or illustration: Naukri / LinkedIn / Indeed listings", where: "Country homepages — Where we apply" },
  "team-1": { alt: "The UpayaInd team at work", size: "800×600 (4:3)", note: "Team photo: specialists at desks", where: "Country homepages and About — Life at UpayaInd gallery" },
  "team-2": { alt: "A daily stand-up at UpayaInd", size: "800×600 (4:3)", note: "Team photo: stand-up / whiteboard", where: "Country homepages and About — Life at UpayaInd gallery" },
  "team-3": { alt: "A coaching session with an applicant", size: "800×600 (4:3)", note: "Photo: mock interview / coaching call", where: "Country homepages and About — Life at UpayaInd gallery" },
  "poster-looking-for-job": { alt: "Two smiling professionals ready for their next role", size: "900×1000 (9:10)", note: "From the client poster: two professionals in business attire on a light blue background", where: "Country homepages — Looking for a job? promo banner" },
  "about-hero": { alt: "The UpayaInd office", size: "1200×700 (12:7)", note: "Photo: office exterior or main workspace", where: "About page — hero" },
  "contact-office-in": { alt: "UpayaInd office in Hyderabad", size: "800×500 (16:10)", note: "Photo: Hyderabad office, Kondapur", where: "Contact page — offices (India)" },
  "contact-office-us": { alt: "UpayaInd office in Erie, Pennsylvania", size: "800×500 (16:10)", note: "Photo: Erie PA office", where: "Contact page — offices (United States)" },
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
} satisfies Record<string, ImageSlotDef>;

export type ImageSlotId = keyof typeof MARKETING_IMAGES;

export function imageSlot(id: string): ImageSlotDef | null {
  return (MARKETING_IMAGES as Record<string, ImageSlotDef>)[id] ?? null;
}
