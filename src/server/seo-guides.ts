/**
 * Starter blog posts (D-172): one resume / CV format guide per country we serve, plus two
 * evergreen explainers. The seed creates them once as published BLOG entries; after that the
 * CMS owns them (the seed never overwrites an existing post), so the team can edit, unpublish
 * or delete any of them in Admin → Content.
 *
 * Written in the same markdown subset as the legal pages (`compileLegal`): `#` = h2, `##` = h3,
 * `- ` lists, `**bold**`, and same-site `[links](/path)` only.
 *
 * Content rules: describe what our resume styles actually do (prisma/seed.ts RESUME_STYLES) and
 * widely accepted hiring conventions. No invented statistics, no immigration advice, no promises
 * of interviews or offers (SPEC §9.4 spirit; our guarantee is about effort, not outcomes).
 */

export type GuidePost = {
  slug: string;
  title: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  tags: string[];
  text: string;
};

const US = `A US resume is short, factual and built to be skimmed. Recruiters in the United States expect one page for most candidates, no personal details beyond your contact information, and achievements written as numbers. This guide covers the layout, the sections and the mistakes that most often cost international applicants a reply.

# US resume format at a glance

- **Name of the document:** resume, not CV. In the US a CV is a long academic document.
- **Page size:** US Letter (8.5 x 11 inches), not A4.
- **Length:** one page for up to about ten years of experience, two pages at most after that.
- **Order:** reverse-chronological, most recent role first.
- **Spelling:** American English (optimized, analyzed, program).
- **Dates:** month and year, for example Jan 2024 to Mar 2025.
- **File type:** PDF unless the application form asks for Word.

# Sections, in order

1. **Header.** Name, phone, professional email, city and state, LinkedIn URL. A portfolio or GitHub link if it is relevant to the role.
2. **Summary.** Two or three lines that say what you do, how long you have done it and what you are strongest at. Skip the objective statement.
3. **Skills.** For technical roles, put skills near the top so a recruiter sees the stack within seconds. Group them: languages, frameworks, tools, cloud.
4. **Experience.** Company, title, location and dates, then three to five bullets per role. Start each bullet with an action verb and end it with a result.
5. **Projects.** Useful for students and career changers. Name the project, the tools and what it achieved.
6. **Education.** Degree, university, graduation date. Add GPA only if it is strong and you graduated recently.
7. **Certifications.** Only the ones that matter for the job.

# What to leave out

US employers follow strict anti-discrimination practice, so a resume with personal details looks out of place and can be set aside. Leave out:

- Photo
- Date of birth or age
- Marital status, religion, nationality
- Full street address (city and state are enough)
- References, or the line "References available on request"

# How to write bullets that get read

A weak bullet describes a duty. A strong bullet shows a result.

- Weak: Responsible for the reporting dashboard.
- Strong: Rebuilt the reporting dashboard in React, cutting page load time from 6 seconds to 1.5 seconds for 4,000 daily users.

If you do not have an exact number, use an honest estimate of scale: team size, number of users, volume of tickets, size of the budget. Never invent one.

# Work authorization on a US resume

Whether you are on OPT, STEM OPT, H-1B or a green card, you do not have to print your status on the resume. Most online application forms ask directly whether you are authorized to work and whether you will need sponsorship, and those questions should always be answered truthfully. Some candidates add a short line such as "Authorized to work in the US" when it removes doubt. That is a personal choice, not a rule.

# Make it easy for applicant tracking systems

Most US employers receive applications through an applicant tracking system (ATS). The system stores your resume and lets recruiters search and filter it, so the text has to be readable by software:

- One column, standard fonts, no text boxes, tables or graphics.
- Standard headings: Summary, Skills, Experience, Education.
- The exact terms from the job description, where they are true for you. If the posting says "Kubernetes", write "Kubernetes", not only "container orchestration".

Our guide on [how to tailor a resume to a job description](/blog/tailor-resume-to-job-description) walks through this step by step.

# Common mistakes by international applicants

- Sending a two or three page CV in A4 with a photo.
- British or Indian spelling and date formats (15/03/2024 reads as an error in the US).
- A "Declaration" or "Personal details" section at the end.
- Listing every course from university instead of results from real work or projects.

# Want it done for you?

UpayaInd builds your master resume in the US format, then tailors it to every job we apply to on your behalf, each weekday. You see every application in your dashboard. See [how it works](/how-it-works) or [compare plans](/pricing).`;

const UK = `In the United Kingdom you send a CV, not a resume, and the conventions are different from the US and from India: two pages of A4, a short personal statement at the top, British spelling, and no photo or date of birth. This guide explains the layout UK recruiters expect and how to mention your right to work.

# UK CV format at a glance

- **Name of the document:** CV (curriculum vitae).
- **Page size:** A4.
- **Length:** two pages. One page is fine for a new graduate; three is too many.
- **Order:** reverse-chronological.
- **Spelling:** British English (organised, optimised, analyse, programme).
- **Dates:** month and year, for example Sep 2023 to Jun 2025.
- **File type:** PDF or Word, whichever the advert asks for.

# Sections, in order

1. **Header.** Name, phone, email, town or city, LinkedIn URL. No need to write "Curriculum Vitae" as a title.
2. **Personal statement.** Three or four lines: who you are professionally, what you have done and what you are looking for. Write it for the role you are applying to.
3. **Experience.** Employer, job title, location and dates, then bullets that show what you achieved. In the UK, experience usually comes before the skills list.
4. **Skills.** Technical tools, methods and languages relevant to the job.
5. **Education.** Degree, classification (for example 2:1 or Merit), university and dates. UK recruiters understand UK classifications, so give an equivalent if your degree is from overseas.
6. **Projects and certifications.** Where they add evidence for the role.

# What to leave out

The Equality Act 2010 protects candidates from discrimination, and UK employers prefer not to see personal details that are irrelevant to the job. Leave out:

- Photo
- Date of birth or age
- Nationality, marital status, religion
- Full home address (town or city is enough)
- National Insurance number

"References available on request" is optional. Most recruiters assume it, so the line can go if you need the space.

# Right to work and sponsorship

UK employers must check that every new hire has the right to work. If your status is an advantage, say so in one line under your header or at the end of your personal statement, for example "Graduate visa, full right to work in the UK" or "Settled status". Keep it factual and short.

If you will need Skilled Worker sponsorship, apply to employers that hold a sponsor licence. The Home Office publishes its register of licensed sponsors, and many job adverts state whether sponsorship is available. Answer any sponsorship question on an application form truthfully.

# Write achievements, not duties

- Weak: Responsible for monthly management accounts.
- Strong: Produced monthly management accounts for a business with £12m turnover and reduced the month-end close from eight working days to five.

Use real figures where you have them and honest estimates of scale where you do not.

# Applicant tracking systems in the UK

Large UK employers and most recruitment agencies store CVs in an applicant tracking system and search them by keyword. Keep the layout simple (one column, standard headings, no tables or graphics) and use the same terms as the job advert where they genuinely apply to you. See [how to tailor a resume to a job description](/blog/tailor-resume-to-job-description).

# Common mistakes by international applicants

- Sending a one-page US resume in Letter size, or a three-page CV with a photo.
- American spelling and month-first dates.
- No personal statement, so the recruiter has to work out what you want.
- A long list of duties copied from a job description.

# Want it done for you?

UpayaInd writes your CV in the UK format and tailors it to each role we apply to on your behalf, every weekday, including sponsor-licensed employers only when you need sponsorship. See the [UK service](/uk) or [UK pricing](/uk/pricing).`;

const CA = `A Canadian resume looks a lot like a US resume: reverse-chronological, focused on results, and free of personal details. The differences are in the length, the spelling and a few details that matter to Canadian employers, such as bilingual ability. Here is the format to follow.

# Canadian resume format at a glance

- **Name of the document:** resume. "CV" is used mainly in academia, medicine and in Quebec.
- **Page size:** US Letter (8.5 x 11 inches).
- **Length:** up to two pages. One page is fine for students and new graduates.
- **Order:** reverse-chronological.
- **Spelling:** Canadian English (colour, centre, licence as a noun).
- **Dates:** month and year, for example May 2023 to Aug 2025.
- **File type:** PDF unless the posting asks for Word.

# Sections, in order

1. **Header.** Name, phone, email, city and province, LinkedIn URL.
2. **Summary.** Two or three lines on your profession, experience and strengths.
3. **Skills.** Grouped technical and professional skills that match the posting.
4. **Experience.** Employer, title, city and dates, then bullets that start with an action verb and end with a result.
5. **Projects.** Especially useful for co-op students and recent graduates.
6. **Education.** Credential, institution and graduation date.
7. **Certifications and languages.** If you work in both English and French, say so clearly. Bilingual candidates are in demand for many roles.

# What to leave out

Canadian human rights law protects candidates from discrimination, so personal details do not belong on a resume. Leave out:

- Photo
- Date of birth or age
- Marital status, religion, nationality or immigration category
- Social Insurance Number (SIN). Never put it on a resume. An employer only needs it after you are hired.
- Full street address

# "Canadian experience"

Newcomers often hear that employers want Canadian experience. You cannot invent it, but you can make your existing experience easy to compare:

- Describe employers in a few words if they are not known in Canada, for example "a 2,000-employee logistics company".
- Use the job titles and terms Canadian postings use for the same work.
- Put co-op terms, internships, volunteering and Canadian projects on the first page.
- Show results in numbers, which translate across any market.

# Work authorization

You do not need to print your status on the resume. Many candidates on a post-graduation work permit or with permanent residence add a short line such as "Authorized to work in Canada" to remove doubt. Application forms often ask about work authorization directly. Answer truthfully.

# Applicant tracking systems

Most mid-size and large Canadian employers use an applicant tracking system to store and search applications. Use one column, standard headings and plain formatting, and include the exact skills named in the posting where they are true for you. Our guide on [tailoring a resume to a job description](/blog/tailor-resume-to-job-description) explains how.

# Common mistakes

- An A4 CV with a photo and personal details.
- A "Declaration" at the end.
- Leaving out French when you are fluent.
- Describing duties instead of results.

# Want it done for you?

UpayaInd writes your Canadian resume and tailors it to every job we apply to for you, each weekday, on Job Bank, Indeed, LinkedIn and company sites. See the [Canada service](/ca) or [Canada pricing](/ca/pricing).`;

const AU = `An Australian resume is longer than an American one and more direct than a British CV. Two to three pages is normal, a career summary and a key skills section sit at the top, and referees are part of the document. This guide sets out the format Australian recruiters expect.

# Australian resume format at a glance

- **Name of the document:** resume. "CV" is also understood and used for the same document.
- **Page size:** A4.
- **Length:** two to three pages. One page is usually too short for an experienced candidate.
- **Order:** reverse-chronological.
- **Spelling:** Australian English (organised, colour, centre, program for a computer program).
- **Dates:** month and year, for example Feb 2022 to Nov 2024.
- **File type:** Word or PDF, as the advert requests. Some recruiters prefer Word.

# Sections, in order

1. **Header.** Name, mobile number, email, suburb or city and state, LinkedIn URL.
2. **Career summary.** Three or four lines: your profession, years of experience, strengths and the kind of role you want.
3. **Key skills.** A short list of the skills the advert asks for, technical and professional.
4. **Experience.** Employer, title, location and dates. A one-line description of the employer helps if it is not known in Australia. Then responsibilities in brief and achievements in bullets.
5. **Education and certifications.** Qualification, institution and year. Include licences and checks that matter for the role.
6. **Referees.** Either two referees with title and contact details, or the line "Referees available on request".

# What to leave out

- Photo
- Date of birth or age
- Marital status, religion, nationality
- Full street address
- Tax file number

# Work rights

Australian recruiters often screen on work rights early, so many candidates state them briefly near the header, for example "Full working rights in Australia" or the visa you hold. Keep it to one factual line. If an application form asks about work rights or sponsorship, answer truthfully.

# Responsibilities and achievements

Australian resumes usually separate what the job was from what you achieved in it.

- Responsibilities: one or two lines on the scope of the role, team size and who you reported to.
- Achievements: bullets with outcomes. For example: "Cut average ticket resolution time from 3 days to 1 day by introducing a triage rota across a team of 6."

# Selection criteria

Government and university roles often ask you to address key selection criteria in a separate document. Follow the instructions in the advert exactly. A strong resume does not replace that response.

# Applicant tracking systems

Recruitment agencies and large employers store resumes in searchable systems. Use a simple one-column layout with standard headings, and use the wording of the advert where it is true for you. See [how to tailor a resume to a job description](/blog/tailor-resume-to-job-description).

# Common mistakes by international applicants

- A one-page US resume that leaves out detail Australian recruiters expect.
- No key skills section.
- No referees and no mention of them.
- American spelling.

# Want it done for you?

UpayaInd writes your resume in the Australian format and tailors it to every role we apply to on your behalf, each weekday, on SEEK, LinkedIn, Indeed and company sites. See the [Australia service](/au) or [Australia pricing](/au/pricing).`;

const NZ = `A New Zealand CV is practical and plain: a short profile, your key skills, your work history with achievements, and referees. Two to three pages of A4 is the norm. This guide covers the format New Zealand employers expect and the details that are different from other countries.

# New Zealand CV format at a glance

- **Name of the document:** CV. "Resume" is understood too.
- **Page size:** A4.
- **Length:** two to three pages.
- **Order:** reverse-chronological.
- **Spelling:** New Zealand English, which follows British spelling (organised, colour, centre).
- **Dates:** month and year, for example Mar 2022 to Dec 2024.
- **File type:** Word or PDF, as the advert requests.

# Sections, in order

1. **Header.** Name, phone, email, town or city, LinkedIn URL.
2. **Profile.** Three or four lines about what you do, your experience and what you are looking for.
3. **Key skills.** The skills the advert asks for, with a few words of evidence where you can.
4. **Work history.** Employer, title, location and dates, a line on the role, then achievements as bullets. Add a short description of an overseas employer so a New Zealand reader can place it.
5. **Education and qualifications.** Qualification, institution and year.
6. **Referees.** Two referees with their role and contact details, or "Referees available on request". New Zealand employers do call referees, so tell yours to expect it.

# What to leave out

- Photo
- Date of birth or age
- Marital status, religion, nationality
- IRD number
- Full street address

# Visa status

Employers in New Zealand need to know you can legally work for them. One factual line near the header is common, for example "Post-study work visa, valid to 2027" or "New Zealand resident". If you will need an employer-supported visa, be honest about it when asked.

# Tone

New Zealand workplaces value plain speaking. Describe what you did and what changed because of it, without inflated language.

- Too much: "World-class visionary leader who revolutionised operations."
- Better: "Led a team of 8 and reduced order errors from 4% to 1% in a year."

# Applicant tracking systems

Larger employers and recruitment agencies use systems that store and search CVs. Keep to one column, standard headings and plain formatting, and use the terms in the advert where they are true for you. See [how to tailor a resume to a job description](/blog/tailor-resume-to-job-description).

# Common mistakes by international applicants

- A one-page resume with no referees.
- A photo and personal details.
- American spelling.
- Job titles that mean something different in New Zealand, with no explanation of the role.

# Want it done for you?

UpayaInd writes your CV in the New Zealand format and tailors it to every role we apply to on your behalf, each weekday, on SEEK, Trade Me Jobs, LinkedIn and company sites. See the [New Zealand service](/nz) or [New Zealand pricing](/nz/pricing).`;

const IN = `Indian resumes have changed. Recruiters on Naukri and LinkedIn now expect a clean one or two page document that leads with skills and results, not a biodata with a photo, a declaration and your father's name. This guide covers the current format for freshers and for experienced professionals.

# Indian resume format at a glance

- **Name of the document:** resume. "CV" and "biodata" are still heard, but recruiters ask for a resume.
- **Page size:** A4.
- **Length:** one page for freshers, two pages at most for experienced candidates.
- **Order:** reverse-chronological.
- **Dates:** month and year, for example Jul 2022 to Present.
- **File type:** PDF for email and company sites. Job portals accept Word and PDF.

# Sections for experienced professionals

1. **Header.** Name, phone, email, city, LinkedIn URL.
2. **Profile summary.** Three or four lines: role, years of experience, domain and core strengths.
3. **Skills.** Grouped by type. Recruiters search portals by skill, so use the standard name of each tool and technology.
4. **Experience.** Company, designation, location and dates, then bullets with results. Mention team size, clients or scale.
5. **Projects.** Common and useful in IT services. Give the client domain, your role, the stack and the outcome.
6. **Education.** Degree, college, university, year and CGPA or percentage.
7. **Certifications.**

# Sections for freshers

1. **Header.**
2. **Career objective or summary.** Two lines on what you studied and the role you want.
3. **Education.** Put it near the top, with CGPA or percentage for degree, 12th and 10th.
4. **Skills.**
5. **Projects and internships.** This is your experience. Describe what you built, with which tools, and what it did.
6. **Achievements and certifications.**

# What you can leave out now

None of these help a recruiter decide, and most companies no longer expect them:

- Photo
- Date of birth, gender, marital status, religion
- Father's name and full permanent address
- Passport number
- The declaration ("I hereby declare that the above information is true...") with place, date and signature

Some employers and some government applications still ask for specific personal details. Add them only when the application asks.

# Make your Naukri and LinkedIn profiles match

On Indian job portals your profile is searched before your resume is opened. Keep the resume headline, key skills and current designation on the portal consistent with the resume, and update the profile regularly.

# Write results, not responsibilities

- Weak: Worked on API development for the client.
- Strong: Built 14 REST APIs in Java and Spring Boot for a retail client, handling 2 lakh requests a day with 99.9% uptime.

Use real numbers. If you do not have one, describe the scale honestly.

# Notice period and CTC

Recruiters will ask for your notice period, current CTC and expected CTC. They belong in the portal profile or the conversation, not on the resume itself.

# Applying abroad from India

Every country has its own format. If you are applying overseas, do not send the Indian version. See our guides to the [US resume](/blog/us-resume-format), the [UK CV](/blog/uk-cv-format), the [Canadian resume](/blog/canadian-resume-format), the [Australian resume](/blog/australian-resume-format) and the [New Zealand CV](/blog/new-zealand-cv-format).

# Want it done for you?

UpayaInd writes your resume and tailors it to every job we apply to on your behalf, each weekday, on Naukri, LinkedIn, Indeed and company sites. See the [India service](/in) or [India pricing](/in/pricing).`;

const SERVICE = `A job application service applies to jobs on your behalf. You give it your background and the kind of role you want; a specialist finds matching openings, tailors your resume to each one, submits the application and records it so you can see what was sent. You spend your time preparing for interviews instead of filling in forms. This guide explains how these services work, how they differ from recruiters and auto-apply tools, and what to check before you pay for one.

# What a job application service does

- **Finds roles that fit you.** Based on your titles, locations, salary range and work authorization.
- **Tailors your resume to each job.** The same master resume, reordered and reworded to match what each posting asks for, using only your real experience.
- **Submits the applications.** On job boards and company career sites, usually a set number every working day.
- **Tracks everything.** A list of every application with the company, role, date, the resume version that was sent and its current status.

Some services, including ours, also help you prepare for interviews.

# Is it the same as a reverse recruiter?

Largely, yes. "Reverse recruiter" is another name for someone you hire to run your job search. A traditional recruiter is paid by an employer to fill that employer's vacancy. A reverse recruiter is paid by you and works only for you, across as many employers as fit.

# How it differs from other options

## Recruiters and staffing agencies

They are free for candidates because the employer pays. They put you forward only for the vacancies they are trying to fill, and their client is the employer.

## Auto-apply bots

Software that submits the same resume to hundreds of postings in minutes. It is cheap, but the applications are generic, mistakes in forms are common, and you often cannot tell what was sent in your name.

## Resume writers

They improve one document. You still have to find the jobs and apply.

## A job application service

People do the applying, each application gets a tailored resume, and you can see all of it. It costs more than a bot because a person's time is involved.

# Who it helps most

- International students and graduates on a time-limited visa, who need volume early.
- Working professionals who cannot spend two hours a day on applications.
- People returning to work or changing field, who need many well-targeted applications to get a first conversation.
- Anyone whose search has stalled because applying has become exhausting.

It helps less if you are aiming at a handful of specific employers through referrals, where a personal approach matters more than volume.

# What to check before you pay

1. **Who applies?** A named person, or software?
2. **Is every resume tailored, and is it truthful?** A service should never add skills, titles or dates you do not have.
3. **Can you see every application?** Ask for a live tracker, not a weekly summary.
4. **How many applications, and how often?** Look for a clear number per working day.
5. **What do they do with your logins and data?** Ask how credentials are stored and who can see them.
6. **What is promised?** Be careful with anyone who guarantees a job or an offer. Hiring decisions belong to employers. An honest service guarantees its effort and transparency.
7. **What are the refund and cancellation terms?** Read them first.

# How UpayaInd works

A dedicated specialist applies to jobs for you every weekday, with a resume tailored to each role from your real experience. Every application appears in your dashboard with the resume that was sent. We work in the United States, India, the United Kingdom, Canada, Australia and New Zealand, each with its own resume format and job portals.

- [How it works](/how-it-works)
- [Plans and pricing](/pricing)
- [Our guarantee](/legal/guarantee)
- [Frequently asked questions](/faq)`;

const TAILOR = `Tailoring a resume means adjusting it so that the person reading it for one specific job sees, within seconds, that you match what they asked for. You do not rewrite your history. You choose which parts of it to put first and you describe them in the employer's own terms. Here is a method you can repeat for every application.

# Why tailoring matters

Most employers collect applications in an applicant tracking system (ATS). The system stores each resume and lets recruiters search, filter and rank candidates, often by the skills and titles in the job description. A recruiter then skims the shortlisted resumes quickly. A tailored resume helps at both moments: it contains the terms the recruiter searches for, and it puts the most relevant evidence where the eye lands first.

# Step 1: Read the job description twice

On the second read, mark three things:

- **Must-haves.** Skills, tools, qualifications and years of experience listed as required.
- **Repeated words.** Anything mentioned more than once is important to the hiring manager.
- **The outcome.** What this person is being hired to deliver.

# Step 2: Match honestly

Put each must-have into one of three groups:

- **I have it and can prove it.** These go in your summary, skills and first bullets.
- **I have something close.** Describe what you actually did, using accurate terms. If the posting asks for AWS and your experience is on Azure, say Azure and name the equivalent services.
- **I do not have it.** Leave it out. Adding a skill you do not have fails at the interview, and it is dishonest.

# Step 3: Rewrite the summary

Your two or three line summary should read like an answer to the posting: the job title or a close equivalent, your years of experience, and the two or three strengths the posting cares about most.

# Step 4: Reorder skills and bullets

- Move the skills named in the posting to the front of your skills section.
- In each role, lead with the bullet most relevant to this job.
- Cut or shorten bullets that do not matter for this employer.

# Step 5: Use the employer's wording

If the posting says "stakeholder management" and your resume says "client liaison" for the same work, use their phrase. Spell tools and certifications exactly as the posting does. Include both the full term and the abbreviation the first time, for example "search engine optimisation (SEO)".

# Step 6: Keep the format readable by software

- One column, standard fonts.
- Standard headings such as Summary, Skills, Experience and Education.
- No text boxes, tables, images or icons carrying information.
- PDF or Word, whichever the application asks for.

# Step 7: Check it before you send

- Does the top third of page one show you fit this job?
- Is every claim true and can you talk about it in an interview?
- Is the format right for the country? A [US resume](/blog/us-resume-format), a [UK CV](/blog/uk-cv-format), a [Canadian resume](/blog/canadian-resume-format), an [Australian resume](/blog/australian-resume-format), a [New Zealand CV](/blog/new-zealand-cv-format) and an [Indian resume](/blog/indian-resume-format) all follow different rules.

# What tailoring is not

It is not keyword stuffing, hiding white text, or pasting the job description into your resume. Recruiters see the resume as well as the system, and these tricks are easy to spot.

# How long does it take?

Done properly, fifteen to thirty minutes for each application. That is the real cost of a serious job search, and it is why many people stop tailoring after the first week.

# Want it done for you?

This is the work UpayaInd does every weekday: a specialist tailors your resume to each job, from your real experience only, applies for you and logs every application in your dashboard. See [how it works](/how-it-works) or [compare plans](/pricing).`;

export const GUIDE_POSTS: readonly GuidePost[] = [
  {
    slug: "what-is-a-job-application-service",
    title: "What is a job application service, and is it worth it?",
    excerpt: "How done-for-you job application services and reverse recruiters work, how they differ from recruiters and auto-apply bots, and what to check before you pay.",
    seoTitle: "What is a job application service?",
    seoDescription: "How job application services and reverse recruiters work, how they differ from recruiters and auto-apply bots, and seven things to check before you pay.",
    tags: ["job search", "job application service"],
    text: SERVICE,
  },
  {
    slug: "tailor-resume-to-job-description",
    title: "How to tailor a resume to a job description, step by step",
    excerpt: "A repeatable seven-step method for matching your resume to a job posting honestly, so it works for applicant tracking systems and for the recruiter who reads it.",
    seoTitle: "How to tailor a resume to a job description",
    seoDescription: "A repeatable seven-step method to match your resume to a job description honestly, for applicant tracking systems and for the recruiter who reads it.",
    tags: ["resume", "ats", "job search"],
    text: TAILOR,
  },
  {
    slug: "us-resume-format",
    title: "US resume format: the one-page layout American recruiters expect",
    excerpt: "Page size, length, sections, what to leave out and how to handle work authorization on a US resume, with the mistakes international applicants make most.",
    seoTitle: "US resume format: a complete guide",
    seoDescription: "US resume format explained: Letter size, one page, sections in order, what to leave out, work authorization and ATS-friendly layout for OPT and H-1B applicants.",
    tags: ["resume", "resume format", "united states"],
    text: US,
  },
  {
    slug: "uk-cv-format",
    title: "UK CV format: layout, length and what to leave out",
    excerpt: "Two pages of A4, a personal statement and British spelling. How to write a CV for UK employers and how to mention your right to work or need for sponsorship.",
    seoTitle: "UK CV format: layout, length, what to omit",
    seoDescription: "UK CV format explained: two pages of A4, personal statement, British spelling, what to leave out, and how to state your right to work or sponsorship needs.",
    tags: ["resume", "resume format", "united kingdom"],
    text: UK,
  },
  {
    slug: "canadian-resume-format",
    title: "Canadian resume format: a guide for newcomers and graduates",
    excerpt: "How a Canadian resume differs from a US resume or a CV: length, spelling, what to leave out, bilingual skills and how to present experience gained outside Canada.",
    seoTitle: "Canadian resume format: a complete guide",
    seoDescription: "Canadian resume format explained: Letter size, up to two pages, what to leave out (including your SIN), bilingual skills and presenting overseas experience.",
    tags: ["resume", "resume format", "canada"],
    text: CA,
  },
  {
    slug: "australian-resume-format",
    title: "Australian resume format: length, key skills and referees",
    excerpt: "Australian resumes run two to three pages with a career summary, key skills and referees. Here is the structure recruiters expect and how to state your work rights.",
    seoTitle: "Australian resume format: a complete guide",
    seoDescription: "Australian resume format explained: two to three A4 pages, career summary, key skills, achievements, referees and how to state your work rights.",
    tags: ["resume", "resume format", "australia"],
    text: AU,
  },
  {
    slug: "new-zealand-cv-format",
    title: "New Zealand CV format: what Kiwi employers expect",
    excerpt: "A New Zealand CV is plain and practical: profile, key skills, work history and referees across two to three pages. Here is the format and how to state your visa status.",
    seoTitle: "New Zealand CV format: a complete guide",
    seoDescription: "New Zealand CV format explained: two to three A4 pages, profile, key skills, work history, referees, what to leave out and how to state your visa status.",
    tags: ["resume", "resume format", "new zealand"],
    text: NZ,
  },
  {
    slug: "indian-resume-format",
    title: "Indian resume format for freshers and experienced professionals",
    excerpt: "The current resume format for India: one to two pages, skills and results first, and no photo, declaration or personal details unless the application asks for them.",
    seoTitle: "Indian resume format for freshers and experienced",
    seoDescription: "Indian resume format explained for freshers and experienced professionals: sections in order, what to leave out now, and matching your Naukri profile.",
    tags: ["resume", "resume format", "india"],
    text: IN,
  },
];
