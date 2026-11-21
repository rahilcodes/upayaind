/**
 * Legal pages (D-170): the published text of /legal/<slug>.
 *
 * Source: "Full-Time Placement Program by Upayaind Technologies LLC — Terms of Enrollment"
 * (client PDF, Nov 2026, markets US / UK / CA / AU / NZ). The Placement Agreement reproduces
 * that document; the other pages are written to match it. The seed publishes these entries
 * and the admin CMS can edit them afterwards (an admin-edited entry is never overwritten).
 *
 * Text is written in a tiny markdown subset and compiled to Tiptap JSON (what the CMS editor
 * loads) and HTML (what the page renders), so no editor dependency is needed in the seed.
 */

export const LEGAL_VERSION = "2026-11-21";

export const COMPANY = {
  name: "Upayaind Technologies LLC",
  address: "502 W 7th St, Ste 100, Erie, PA 16052, United States",
  indiaAddress: "B 609, B-Block, Asian Sun City, Kothaguda X Road, Kondapur, Hyderabad, Telangana 500084, India",
  phone: "+1 (724) 584-1786",
  email: "contact@upayaind.com",
  site: "www.upayaind.com",
} as const;

export type LegalPage = { slug: string; title: string; excerpt: string; text: string };

const effective = `Effective date: 21 November 2026. Version ${LEGAL_VERSION}.`;

const contactBlock = `# Contact
${COMPANY.name}
${COMPANY.address}
Phone: ${COMPANY.phone} · Email: [${COMPANY.email}](mailto:${COMPANY.email}) · ${COMPANY.site}
India office: ${COMPANY.indiaAddress}`;

// ───────────────────────────── Placement Agreement (Terms of Enrollment) ─────────────────────────────

const AGREEMENT = `${effective}
This Placement Agreement (the "Agreement") sets out the Terms of Enrollment for the Full-Time Placement Program offered by ${COMPANY.name}. It applies to applicants in the United States, the United Kingdom, Canada, Australia, New Zealand and India. You accept it by ticking the box at sign-up, by paying for a plan, or by using the program. Please read it together with our [Terms of Service](/legal/terms), [Privacy Policy](/legal/privacy) and [Refund Policy](/legal/refund).

# Parties
This Agreement is made by and between **${COMPANY.name}** (the "Company", "UpayaInd", "we" or "us"), with a principal place of business at ${COMPANY.address}, and the person who creates an account and enrols in the program (the "Client", "you"), at the address given in your account.

# Preamble
UpayaInd is engaged in the business of providing professional information technology and related services. Such services include, but are not limited to, computer and technology consulting, data processing, network design and support, software design and development, application maintenance, systems integration, technical staffing, career placement support and other related professional services. UpayaInd may provide these services to its direct clients or through intermediaries to end users located within the United States and internationally. Such direct clients, indirect clients and end users are collectively referred to in this Agreement as "Third-Party Users".

# 1. Scope of services
## 1.1 Placement Program
Our placement program is meant to assist the Client in finding their dream job by giving the Client access to one-on-one training by a recruiter, a dedicated application specialist who applies to roles on the Client's behalf, and access to a proprietary online training and application-tracking platform based on extensive personal experience, testing and research.
## 1.2 Bonus content
The ${COMPANY.name} placement program may also, at its sole discretion, make available additional bonus content to the Client, such as templates, guides and study plans.
## 1.3 Program support
${COMPANY.name} will make available to the Client a support desk to resolve any technical issues and to answer questions specific to the training materials. Except as expressly outlined in this Agreement, the services purchased under this Agreement are furnished "as is, where is", with all faults and without warranty of any kind, express or implied, including any warranty of merchantability or fitness for any particular purpose.
## 1.4 Interviews and assessments
${COMPANY.name} guarantees that Clients on the Premium package will receive interview support as part of the Placement Program, and that Clients on other packages will receive mock interviews. The Client agrees to be available for all scheduled interviews and assessments facilitated by ${COMPANY.name}. Failure to attend, or lack of cooperation, will result in forfeiture of services without any refund.
## 1.5 No guarantee of employment
UpayaInd does not guarantee that the Client will receive any interview, job offer, salary, start date or visa outcome. Hiring decisions are made solely by employers.

# 2. Payment terms
## 2.1 Payment criteria
The Client will pay for pre-placement services depending on the package they select, as discussed with their career advisor and shown on the pricing page for their market. In addition, the Client agrees to pay ${COMPANY.name} a placement service charge of **8% to 12% of their annual income (first-year salary only)**, payable in **3 equal monthly instalments** after securing a job through or during the program. The exact percentage within that range is confirmed in writing with the Client's career advisor at the time of enrolment or offer.
## 2.2 Post-job payment enforcement
Failure to make payments within the specified period after securing a job will result in:
- **Late fees:** USD 100 (or the equivalent in the currency of your market) per day after the due date, to the extent permitted by the law that applies to you.
- **Legal action:** ${COMPANY.name} reserves the right to initiate legal proceedings, including wage garnishment or assignment where lawful, debt recovery through collection agencies, or filing lawsuits, to collect unpaid balances. All associated costs, including reasonable legal fees, will be the Client's responsibility to the extent permitted by law.
## 2.3 Promissory note and salary disclosure
For the purposes of this Agreement, "Salary" means the Client's gross base pay paid by their employer. Upon accepting employment, the Client agrees to:
1. either sign a promissory note in the form provided by UpayaInd (the "Note") authorising repayment of the Note using ACH, direct-debit or card payments from the Client's bank account, or, where lawful in the Client's jurisdiction, have their wages assigned by their employer in the same amount to be paid directly to ${COMPANY.name}; and
2. notify ${COMPANY.name} of the name, email and phone number of their supervisor or HR contact, and consent to ${COMPANY.name} communicating with that person as necessary or desirable to confirm employment and salary.
## 2.4 Notice of offers
The Client must tell UpayaInd, from their dashboard or by email, within 5 days of accepting any job offer that was obtained through or during the program, and must provide a copy of the offer letter showing the base salary.

# 3. Governing law, jurisdiction and venue
This Agreement shall be construed pursuant to the laws of the State of Pennsylvania pertaining to contracts to be performed in the State of Pennsylvania, all other choice-of-law rules notwithstanding. The parties agree that proper jurisdiction and venue for any dispute arising out of the construction and operation of this Agreement shall be vested in the courts of competent jurisdiction for Erie, Pennsylvania only. Section 9 explains how this applies if you live outside the United States.

# 4. Client responsibility
The Client will put forth reasonable effort to achieve the action items they set for themselves with ${COMPANY.name}. If the Client defaults on any monthly instalment at any time as required by this Agreement, the Client forfeits their access to any training, coaching, collateral or further assets associated with the ${COMPANY.name} full-time job program and will be required to re-invest the total amount of the current program pricing if the Client chooses to resume participating in the program.

# 5. Refunds, disputes and Client cooperation
We do not offer refunds for our services, and all sales are final. The Client understands and acknowledges that there are no refunds from the initiation of services. Should a dispute arise, this document and the Client's account records act as proof of the services provided and negate any attempt to dispute payments for services already rendered, including chargebacks. Clients must fully cooperate during the service period, including being available for interviews, assessments and marketing services, and responding promptly to all communications from ${COMPANY.name} and potential employers. Non-compliance will result in forfeiture of services without any refund. Our [Refund Policy](/legal/refund) describes the limited exceptions required by consumer law in some markets.

# 6. Confidentiality
Each party shall retain in strict confidence the confidential information of the other party, and the confidential information of a party shall only be used by the other party while performing its responsibilities under this Agreement. It will be disseminated only on a need-to-know basis among its employees and contractors that have executed a confidentiality agreement. How UpayaInd handles your personal data is described in the [Privacy Policy](/legal/privacy).

# 7. Miscellaneous
This Agreement is the entire understanding of the parties concerning its subject matter and supersedes all prior discussions, obligations and agreements. This Agreement may be amended or modified only by a written amendment signed by both parties, or by UpayaInd publishing a new version of this page with a new effective date for enrolments made after that date; it cannot be amended by email communications. The Client cannot assign or transfer this Agreement. This Agreement is governed by and construed in accordance with the laws of the State of Pennsylvania. The parties agree that all obligations under this Agreement were performed in Erie, Pennsylvania, and therefore agree to the exclusive jurisdiction of the courts in Erie, Pennsylvania, subject to section 9. If any provision is held unenforceable, the remaining provisions continue in full force.

# 8. Client requirements and acknowledgement
The Client is of legal age (18 or older) and competence, and intends to be legally bound by this Agreement. By accepting, the Client confirms: "I have read this document, and I understand that my results depend on my effort, commitment and cooperation with the program. I am fully committed to achieving my goals and succeeding through the program." The program is designed to help Clients achieve their best potential in the job market, and ${COMPANY.name} is dedicated to supporting Clients through every step of the process.
We believe in the mutual success of both ${COMPANY.name} and the Client. Together, we aim to create a path toward professional growth and opportunity. With your dedication and our comprehensive support, success is within reach.

# 9. Terms for your country
The same program terms apply in every market we serve. The notes below explain how they fit the law where you live. Nothing in this Agreement removes rights that the law of your country gives you and does not allow you to give up.
## 9.1 United States
This Agreement is governed by Pennsylvania law with exclusive venue in Erie, Pennsylvania (section 3). Plan fees are charged in USD through Stripe. The placement service charge may be collected under the promissory note in section 2.3.
## 9.2 United Kingdom
Plan fees are charged in GBP. If you are a consumer, the Consumer Rights Act 2015 and the Consumer Contracts Regulations 2013 may give you rights (including a 14-day cancellation period for services bought online, which ends early once you ask us to start work immediately, as you do at sign-up) that this Agreement cannot exclude, and you may bring a claim in the courts of your home nation. Wage garnishment is not available in the UK; the placement charge is collected by direct debit, card or bank transfer under section 2.3. Late fees are limited to a reasonable pre-estimate of our loss.
## 9.3 Canada
Plan fees are charged in CAD. Provincial consumer-protection legislation (for example the Ontario Consumer Protection Act, 2002 and the Quebec Consumer Protection Act) may give you non-excludable rights, including the right to bring a claim in your province. Any wage assignment is only used where the law of your province permits it; otherwise the placement charge is collected by pre-authorised debit or card. Quebec residents: the parties have expressly requested that this Agreement be drawn up in English. Les parties ont expressément demandé que cette entente soit rédigée en anglais.
## 9.4 Australia
Plan fees are charged in AUD. Our services come with guarantees that cannot be excluded under the Australian Consumer Law. Where a service fails to meet a consumer guarantee, you are entitled to the remedies that law provides; nothing in this Agreement limits those rights. Late fees apply only to the extent they are a genuine pre-estimate of loss. The placement charge is collected by direct debit, card or bank transfer; wage garnishment is only used by court order.
## 9.5 New Zealand
Plan fees are charged in NZD. The Consumer Guarantees Act 1993 and the Fair Trading Act 1986 apply where you acquire our services as a consumer, and nothing in this Agreement limits the rights they give you. The placement charge is collected by direct debit, card or bank transfer; attachment of wages is only used by court order.
## 9.6 India
Plan fees are charged in INR through Razorpay. The Consumer Protection Act, 2019 and the Digital Personal Data Protection Act, 2023 apply to Clients in India, and nothing in this Agreement limits non-waivable rights under those laws. The placement charge is collected by UPI, card, net banking or bank transfer; salary deduction is only used with the Client's written authorisation or by court order.

# 10. Electronic acceptance
This Agreement is accepted electronically. Ticking the "I have read and accept the Placement Agreement" box at sign-up, paying for a plan or using the program has the same effect as a handwritten signature. We record the date, time and version of your acceptance in your account. You can print or save this page at any time, and the version you accepted is included in the data export available from your account settings.

${contactBlock}
Signed for ${COMPANY.name}: Sai Krishna, Managing Director (Authorised Signatory).`;

// ───────────────────────────── Terms of Service ─────────────────────────────

const TERMS = `${effective}
These Terms of Service (the "Terms") govern your use of ${COMPANY.site}, the UpayaInd dashboard and apps, and the done-for-you job application service (together, the "Service") provided by ${COMPANY.name}. By creating an account or using the Service you agree to these Terms, our [Privacy Policy](/legal/privacy), our [Refund Policy](/legal/refund) and, if you enrol in the placement program, the [Placement Agreement](/legal/agreement). If you do not agree, do not use the Service.

# 1. Who can use the Service
You must be at least 18 years old, able to enter a binding contract, and legally allowed to work in the market you select. You must give accurate, current and complete information and keep it up to date. One person may hold one applicant account; accounts cannot be shared, sold or transferred.

# 2. What the Service is
UpayaInd assigns you a dedicated application specialist who searches for roles matching your preferences, tailors your resume to each job description, submits applications on your behalf every working day of your plan, and records every application in your dashboard. Depending on your plan you may also receive mock interviews, interview preparation and training content. The Service is a support service: UpayaInd is not an employer, employment agency placing you with its own clients, visa sponsor or legal adviser, and does not guarantee any interview, offer, salary or timeline.

# 3. Your authorisation to act on your behalf
By ticking the authorisation box at sign-up you authorise UpayaInd and its staff to:
- submit job applications in your name using the resume, profile and preferences you provide;
- create and use job-portal and email accounts you add to your encrypted vault, or create new accounts in your name where needed;
- communicate with employers, recruiters and job portals as you, for the purpose of applying and scheduling interviews.
Some job portals' terms of use restrict account sharing or automated use. You acknowledge this and accept the risk that a portal may limit or close an account used on your behalf. You can withdraw this authorisation at any time from your dashboard settings; we will then stop applying and your plan ends under the Refund Policy.

# 4. Truthful information and AI-tailored resumes
Every resume we send is built only from the experience, education, skills and facts you give us. Our AI tailoring rewrites wording and emphasis to match a job description and runs a validator so that no employer, title, date, degree or certification is invented. You are responsible for the truth of everything in your profile, and you confirm that any skill you tell us you hold is one you can genuinely demonstrate. You must review the resume shown in your dashboard and tell us immediately if anything is wrong. We may refuse to apply where we believe the information is untrue.

# 5. Your responsibilities
- Keep your profile, documents, preferences and contact details accurate.
- Respond to interview requests and messages from your specialist promptly, normally within one working day.
- Attend scheduled interviews, assessments and mock interviews.
- Tell us within 5 days when you accept an offer obtained through or during the Service.
- Do not use the Service for unlawful purposes, to misrepresent your identity or right to work, to apply for roles you cannot lawfully take, or to harass staff or employers.
- Do not copy, scrape, reverse-engineer or resell the Service or its training content.

# 6. Plans, payment and renewal
Plan prices are shown on the pricing page for your market in your local currency and include any applicable taxes unless stated otherwise. Payments are processed by Stripe (United States) or Razorpay (all other markets); we never store full card numbers. Plans are prepaid for the period shown and do not renew automatically unless you choose a renewal. If you buy a plan before an admin activates your account, the plan starts when it is activated. Fees for the placement program, including the post-placement service charge, are set out in the [Placement Agreement](/legal/agreement). Unpaid amounts may be referred for collection as described there.

# 7. Cancellation and refunds
You can cancel from Billing at any time; your plan runs until the end of the period you paid for and no further charges are made. All sales are final and fees are non-refundable except where the [Refund Policy](/legal/refund) or non-excludable consumer law says otherwise. We may suspend or end your access if you breach these Terms, give false information, fail to cooperate, or do not pay; no refund is due in those cases.

# 8. Intellectual property
The Service, platform, templates, guides, training content and brand belong to ${COMPANY.name} or its licensors and are licensed to you for personal, non-commercial use while your account is active. You own the content you give us (your resume, profile and documents) and grant us a licence to store, process, tailor and submit it for the purpose of providing the Service.

# 9. Confidentiality and data
We treat your personal data, credentials and documents as confidential and process them as described in the [Privacy Policy](/legal/privacy). Credentials in your vault are encrypted; only your assigned specialist can use them and every access is logged. Managers may read dashboard messages for quality control. You agree to keep confidential any non-public information about our methods, staff and other applicants.

# 10. Disclaimer of warranties
Except as expressly stated in these Terms or the Placement Agreement, the Service is provided "as is" and "as available", without warranty of any kind, express or implied, including merchantability, fitness for a particular purpose and non-infringement. We do not warrant that the Service will be uninterrupted or error-free, that any application will receive a response, or that you will obtain employment.

# 11. Limitation of liability
To the fullest extent permitted by law, ${COMPANY.name} and its officers, employees and contractors are not liable for indirect, incidental, special, consequential or punitive damages, lost income or lost opportunities arising from the Service, and our total liability for any claim is limited to the plan fees you paid to us in the 12 months before the claim. Nothing in these Terms excludes liability for fraud, death or personal injury caused by negligence, or any liability that cannot be excluded under the law of your country (see section 15).

# 12. Indemnity
You will indemnify ${COMPANY.name} against claims, losses and costs (including reasonable legal fees) arising from information you provide that is untrue, your breach of these Terms, or your breach of a third party's terms or rights, to the extent permitted by law.

# 13. Termination
You may close your account from your settings. We may suspend or terminate accounts that breach these Terms, with notice where practicable. Sections 4, 6, 8, 9, 10, 11, 12, 15 and 16 survive termination, as do payment obligations under the Placement Agreement.

# 14. Changes
We may update these Terms. The new version is published on this page with a new effective date, and material changes are notified by email or in your dashboard at least 14 days before they take effect. Continued use after that date means you accept the new Terms.

# 15. Governing law and your local rights
These Terms are governed by the laws of the State of Pennsylvania, United States, and disputes are heard in the courts of Erie, Pennsylvania, except that if you live in the United Kingdom, Canada, Australia, New Zealand or India you keep the benefit of mandatory consumer-protection and privacy laws of your country and may bring claims in your local courts where those laws allow. Before any formal proceedings, both parties agree to raise the dispute by email to [${COMPANY.email}](mailto:${COMPANY.email}) and try in good faith to resolve it within 30 days.

# 16. General
These Terms, the Placement Agreement, the Privacy Policy and the Refund Policy are the entire agreement between you and us about the Service. If any provision is unenforceable, the rest remains in force. Our failure to enforce a provision is not a waiver. You may not assign these Terms; we may assign them to a successor of our business. Notices to you are sent to the email on your account.

${contactBlock}`;

// ───────────────────────────── Privacy Policy ─────────────────────────────

const PRIVACY = `${effective}
${COMPANY.name} ("UpayaInd", "we") is the data controller for personal data collected through ${COMPANY.site} and the UpayaInd dashboard. This policy explains what we collect, why, who we share it with and the rights you have. It is written to meet the GDPR and UK GDPR (United Kingdom), PIPEDA and provincial laws (Canada), the Privacy Act 1988 and Australian Privacy Principles (Australia), the Privacy Act 2020 (New Zealand), the CCPA/CPRA and other state laws (United States) and the Digital Personal Data Protection Act, 2023 (India).

# 1. What we collect
- **Account details:** name, email, phone, country/market, timezone, password (stored only as a hash), two-factor settings.
- **Career profile:** resumes and documents you upload, work history, education, skills, certifications, salary expectations, visa or work-authorisation status, job preferences and target roles.
- **Vault credentials:** logins for job portals and email accounts you choose to add, so your specialist can apply on your behalf. These are encrypted with per-record keys and are never shown to anyone but your assigned specialist.
- **Applications and interviews:** every role we apply to for you, the tailored resume and cover letter used, employer responses, interview dates and outcomes, and offer details you report (including salary, which the Placement Agreement requires).
- **Messages and support:** messages between you and your specialist, support requests, contact-form submissions and call bookings.
- **Payments:** plan, amount, currency, invoice and payment status. Card and bank details are handled by Stripe or Razorpay and never stored by us.
- **Usage and device data:** log-in times, IP address, approximate country (from IP), browser, pages viewed and, only after you consent, analytics events.
- **Consents:** the date, time and version of the Terms, Privacy Policy, Placement Agreement and authorisation you accepted.

# 2. Why we use it and our legal basis
- To provide the Service you signed up for: find roles, tailor your resume, apply on your behalf, show you results, prepare you for interviews (performance of a contract).
- To tailor resumes with AI: your profile and the job description are sent to our AI provider to produce a tailored draft, which is then checked by our validator and your specialist (performance of a contract; see section 4).
- To process payments, issue invoices, collect fees due under the Placement Agreement and keep accounting records (contract and legal obligation).
- To run quality control: managers and administrators may read dashboard message threads and review applications (legitimate interest in service quality and staff supervision; disclosed here).
- To keep the Service secure, prevent fraud and enforce our Terms (legitimate interest and legal obligation).
- To send service emails (verification, reminders, weekly reports, interview alerts) and, with your consent or where permitted, marketing emails you can opt out of at any time.
- To measure and improve the website with analytics, only after you accept non-essential cookies (consent).

# 3. Who we share it with
We do not sell personal data. We share it only with:
- **Employers, recruiters and job portals** when we apply on your behalf: your resume, cover letter, contact details and answers to application questions.
- **Service providers** acting on our instructions: cloud hosting and database providers, Cloudflare R2 for file storage, OpenAI for AI resume tailoring (no training on your data under our API terms), Resend for email, Stripe (United States) and Razorpay (other markets) for payments, Cal.com for call bookings, Twilio for WhatsApp notifications where you opt in, and Google Analytics and Microsoft Clarity for analytics after consent.
- **Your supervisor or HR contact** after you accept an offer, only to confirm employment and salary as the Placement Agreement provides.
- **Collection agencies, courts and professional advisers** where needed to recover amounts due or defend legal claims.
- **Authorities** where the law requires.
Our staff who handle your data are in the United States and India and are bound by confidentiality agreements.

# 4. AI processing
Resume tailoring uses large-language-model APIs. Only the data needed for the task (your profile, the job description and the resume being edited) is sent, over encrypted connections, and the output is validated against your real experience before use. We do not allow providers to use your data to train their models. Automated tailoring does not make any decision with legal or similarly significant effects about you; your specialist reviews the output and you can see and challenge every resume in your dashboard.

# 5. International transfers
We operate from the United States and India and use providers in the United States and the European Union. Where data leaves the UK, EEA, Canada, Australia or New Zealand, we rely on standard contractual clauses, the UK International Data Transfer Addendum, or an adequacy decision, and apply the safeguards in section 7.

# 6. How long we keep it
- Account and profile data: while your account is active and for 30 days after deletion is requested, then anonymised.
- Application records (company, role, date, status): kept as a record of the services provided, as the Placement Agreement requires.
- Payments, invoices and consent records: 7 years, or as long as tax, accounting and limitation laws require.
- Messages: wiped 30 days after account deletion; retained before that for quality control.
- Vault credentials: deleted when you remove them, when your plan ends and you ask us to, or when your account is deleted.
- Analytics data: per the retention settings of Google Analytics (14 months) and Clarity.

# 7. Security
Passwords are hashed with Argon2, vault secrets are encrypted at rest with per-record keys, files are stored privately and served through short-lived links, staff access is role-based, logged and audited, staff accounts use two-factor authentication, and all traffic uses TLS. No system is perfectly secure; tell us at [${COMPANY.email}](mailto:${COMPANY.email}) if you suspect a problem with your account.

# 8. Your rights
Depending on where you live you can: access a copy of your data; correct it; delete it; export it (your settings page offers a JSON and files export); restrict or object to processing; withdraw consent, including the authorisation to apply on your behalf; opt out of marketing; and complain to a supervisory authority (the ICO in the UK, the OPC in Canada, the OAIC in Australia, the Office of the Privacy Commissioner in New Zealand, the Data Protection Board of India, or your state attorney general in the United States). California residents have the right to know, delete and correct, and to opt out of "sale" or "sharing"; we do not sell or share personal data for cross-context behavioural advertising and we do not discriminate for exercising rights. Requests can be made from your account settings or by emailing [${COMPANY.email}](mailto:${COMPANY.email}); we respond within 30 days (45 days in California). Account deletion is confirmed by an administrator, after which data is anonymised within 30 days except the records listed in section 6.

# 9. Cookies
See our [Cookie Policy](/legal/cookies). Essential cookies run the site; analytics cookies load only after you accept them in the banner, and you can change your choice from the "Cookie settings" link in the footer.

# 10. Children
The Service is for adults. We do not knowingly collect data from anyone under 18; if we learn that we have, we delete it.

# 11. Changes
We will post changes here with a new effective date and notify you by email or in your dashboard when they are material.

${contactBlock}
Privacy requests and data-protection questions: [${COMPANY.email}](mailto:${COMPANY.email}) (subject "Privacy").`;

// ───────────────────────────── Refund Policy ─────────────────────────────

const REFUND = `${effective}
This policy explains when UpayaInd refunds money. It forms part of our [Terms of Service](/legal/terms) and the [Placement Agreement](/legal/agreement).

# 1. All sales are final
Plan fees pay for work that starts as soon as your account is activated: a specialist is assigned, your profile is reviewed, resumes are tailored and applications are sent every working day. For that reason we do not offer refunds for our services, and all sales are final from the initiation of services. By paying you ask us to start work immediately and acknowledge that no refund is due once we have started.

# 2. Cancelling
You can cancel from Billing in your dashboard at any time. Your plan keeps running until the end of the period you have paid for, no further charges are made, and your history stays available to you. Cancelling does not refund the current period.

# 3. Forfeiture
Services are forfeited without refund if you do not attend scheduled interviews, assessments or mock interviews, do not cooperate or respond to your specialist and potential employers, give false information, breach our Terms, or default on an instalment due under the Placement Agreement.

# 4. When we do refund
- **We could not start:** if your account is never activated (for example we cannot serve your market or role) we refund the plan fee in full.
- **Duplicate or mistaken charges:** refunded in full once confirmed.
- **Our fault:** if we fail to deliver a plan's core service for a full week (no applications sent while your profile was complete and your vault worked) and cannot fix it, we refund that week pro rata or extend your plan, at your choice.
- **Consumer law:** where the law of your country gives you a non-excludable right to a refund or remedy, we honour it (section 6).
Approved refunds go back to the original payment method within 10 working days; banks may take longer to show them.

# 5. Chargebacks and disputes
Your account records (applications sent, resumes generated, messages and consents) are proof of the services provided. Please contact us before raising a dispute with your bank; chargebacks raised for services already rendered will be contested with those records, and the account may be suspended until the matter is resolved.

# 6. Your country
- **United States:** this policy applies as written under Pennsylvania law.
- **United Kingdom:** as a consumer you have a 14-day right to cancel services bought online, but because you ask us to start immediately, you pay for the service supplied before you cancel and lose the right once the service is fully performed. The Consumer Rights Act 2015 remedies for a service not performed with reasonable care and skill are not excluded.
- **Canada:** provincial consumer-protection laws (including cooling-off and cancellation rights for certain contracts) apply where they cannot be excluded.
- **Australia:** our services come with guarantees under the Australian Consumer Law that cannot be excluded. If a service does not meet a guarantee you are entitled to the remedies that law provides, including a refund for a major failure.
- **New Zealand:** the Consumer Guarantees Act 1993 applies where you buy as a consumer and its remedies are not excluded.
- **India:** the Consumer Protection Act, 2019 applies; payments are refunded via Razorpay to the original method.

# 7. Placement service charge
The post-placement service charge in the Placement Agreement is earned when you accept an offer and is not refundable, including if you later leave or lose the job.

# 8. How to ask
Email [${COMPANY.email}](mailto:${COMPANY.email}) with the subject "Refund request", your account email and the reason. We reply within 5 working days.

${contactBlock}`;

// ───────────────────────────── Our Guarantee ─────────────────────────────

const GUARANTEE = `Our guarantee is about effort, transparency and support: applications sent on every working day of your plan, every resume tailored from your real experience, every application visible in your dashboard, and dedicated interview support for Premium members. We do not guarantee a job offer, a salary or a timeline, because hiring decisions belong to employers.

# What we guarantee
- **Daily applications.** Your specialist applies to matching roles on every working day of your plan, up to the daily target shown on your plan, as long as your profile is complete and your vault logins work.
- **Full visibility.** Every application appears in your dashboard with the company, role, date, job link, status and the exact resume used, usually within the same working day.
- **Truthful resumes.** Each resume is tailored from the experience, skills and education you gave us and checked by a validator so nothing is invented. If you ever find a resume that misstates your history, tell us and we correct it and re-apply where possible.
- **A dedicated specialist.** You are assigned a named UpayaInd specialist within one working day of activation and can message them from your dashboard.
- **Interview support.** Premium members receive interview preparation and support for every interview they report; members on other plans receive mock interviews, as the Placement Agreement provides.
- **Make-good.** If we miss a full week of applications while your profile and vault were ready, we extend your plan by that week or refund it pro rata, at your choice (see the [Refund Policy](/legal/refund)).

# What we cannot guarantee
Interviews, offers, salary levels, start dates, visa sponsorship, responses from employers or the behaviour of job portals. Results depend on your experience, the market and your cooperation, as explained in the [Placement Agreement](/legal/agreement).

# How to claim
Email [${COMPANY.email}](mailto:${COMPANY.email}) with the subject "Guarantee" within 14 days of the week concerned. We review your dashboard records and reply within 5 working days.

${contactBlock}`;

// ───────────────────────────── Cookie Policy ─────────────────────────────

const COOKIES = `${effective}
This policy explains how ${COMPANY.site} and the UpayaInd dashboard use cookies and similar technologies, and how you can control them. It forms part of our [Privacy Policy](/legal/privacy).

# 1. What cookies are
Cookies are small files placed on your device by a website. We also use local storage and similar technologies; this policy calls them all "cookies".

# 2. Cookies we use
- **Essential (always on):** sign-in session, security and CSRF protection, two-factor state, your chosen market and currency, and the record of your cookie choice. The site cannot work without these, so they do not need consent.
- **Analytics (only with your consent):** Google Analytics 4 and Microsoft Clarity, used to understand which pages are visited, where visitors drop off and how the site performs. IP addresses are anonymised where the tool allows. These load only after you click "Accept" in the cookie banner.
- **Payment and booking (when you use those features):** Stripe or Razorpay set cookies on the checkout page for fraud prevention, and Cal.com sets cookies when you book a call. Videos are embedded through youtube-nocookie.com and Vimeo's player with tracking disabled.
We do not use advertising or cross-site tracking cookies and we do not sell data collected by cookies.

# 3. Your choices
When you first visit we show a banner with "Accept" and "Reject non-essential". Rejecting keeps only essential cookies. You can change your choice at any time from the "Cookie settings" link in the footer. You can also block or delete cookies in your browser settings; blocking essential cookies will stop you signing in.

# 4. How long they last
Session cookies end when you close the browser or sign out. The sign-in cookie lasts up to 7 days, the cookie-choice cookie 6 months, and analytics cookies up to 14 months (Google Analytics) or 13 months (Clarity).

# 5. Changes
We update this page when the cookies we use change; the effective date above shows the latest version.

${contactBlock}`;

export const LEGAL_PAGES: readonly LegalPage[] = [
  { slug: "agreement", title: "Placement Agreement", excerpt: "Terms of Enrollment for the UpayaInd Full-Time Placement Program: services, the placement service charge, payment, cooperation, governing law and country-specific terms.", text: AGREEMENT },
  { slug: "terms", title: "Terms of Service", excerpt: "The rules for using the UpayaInd website, dashboard and done-for-you job application service.", text: TERMS },
  { slug: "privacy", title: "Privacy Policy", excerpt: "What personal data UpayaInd collects, how it is used, shared and protected, and the rights you have in the US, UK, Canada, Australia, New Zealand and India.", text: PRIVACY },
  { slug: "refund", title: "Refund Policy", excerpt: "All sales are final once services start; cancel any time and your plan runs to the end of the paid period. Limited exceptions and your local consumer rights.", text: REFUND },
  { slug: "guarantee", title: "Our Guarantee", excerpt: "Applications on every working day of your plan, truthful tailored resumes, full visibility in your dashboard and dedicated interview support. We never guarantee a job offer.", text: GUARANTEE },
  { slug: "cookies", title: "Cookie Policy", excerpt: "Essential cookies run the site; analytics cookies load only after you accept them. How to change your choice.", text: COOKIES },
];

// ───────────────────────────── Markdown subset → Tiptap JSON + HTML ─────────────────────────────

type Mark = { type: "bold" } | { type: "link"; attrs: { href: string; target: null; rel: null; class: null } };
type Inline = { type: "text"; text: string; marks?: Mark[] };
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[] } | Inline;

/** Text escaping identical to Tiptap's generateHTML (quotes stay literal in text nodes). */
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s: string) {
  return esc(s).replace(/"/g, "&quot;");
}

/** `**bold**` and `[text](href)` only; href must be a same-site path or mailto:. */
function inline(src: string): { nodes: Inline[]; html: string } {
  const nodes: Inline[] = [];
  let html = "";
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (text: string, marks?: Mark[]) => {
    if (!text) return;
    nodes.push(marks ? { type: "text", text, marks } : { type: "text", text });
  };
  while ((m = re.exec(src))) {
    push(src.slice(last, m.index));
    html += esc(src.slice(last, m.index));
    if (m[1] !== undefined) {
      push(m[1], [{ type: "bold" }]);
      html += `<strong>${esc(m[1])}</strong>`;
    } else {
      const href = m[3];
      if (!/^(\/[^/]|mailto:)/.test(href)) throw new Error(`Legal text: unsafe link ${href}`);
      push(m[2], [{ type: "link", attrs: { href, target: null, rel: null, class: null } }]);
      html += `<a href="${escAttr(href)}">${esc(m[2])}</a>`;
    }
    last = m.index + m[0].length;
  }
  push(src.slice(last));
  html += esc(src.slice(last));
  return { nodes, html };
}

/** Compile the markdown subset used above into the CMS body (Tiptap doc) and the HTML the page renders. */
export function compileLegal(text: string): { body: { type: "doc"; content: Node[] }; bodyHtml: string } {
  const content: Node[] = [];
  let html = "";
  let list: { type: "bulletList" | "orderedList"; items: Node[]; html: string } | null = null;
  const flush = () => {
    if (!list) return;
    content.push({ type: list.type, ...(list.type === "orderedList" ? { attrs: { start: 1 } } : {}), content: list.items });
    html += `<${list.type === "bulletList" ? "ul" : "ol"}>${list.html}</${list.type === "bulletList" ? "ul" : "ol"}>`;
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{1,2}) (.+)$/.exec(line);
    const item = /^(?:- |\d+\. )(.+)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length + 1; // "#" → h2, "##" → h3 (h1 is the page title)
      const { nodes, html: h } = inline(heading[2]);
      content.push({ type: "heading", attrs: { level }, content: nodes });
      html += `<h${level}>${h}</h${level}>`;
      continue;
    }
    if (item) {
      const type = line.startsWith("- ") ? "bulletList" : "orderedList";
      if (list && list.type !== type) flush();
      list ??= { type, items: [], html: "" };
      const { nodes, html: h } = inline(item[1]);
      list.items.push({ type: "listItem", content: [{ type: "paragraph", content: nodes }] });
      list.html += `<li><p>${h}</p></li>`;
      continue;
    }
    flush();
    const { nodes, html: h } = inline(line);
    content.push({ type: "paragraph", content: nodes });
    html += `<p>${h}</p>`;
  }
  flush();
  return { body: { type: "doc", content }, bodyHtml: html };
}
