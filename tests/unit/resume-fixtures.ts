import type { ResumeData } from "@/resume/schema";
import type { JdAnalysisData } from "@/server/ai/schemas";

/** Shared fixtures for resume/applications tests (not a test file: no `.test.`). */

export const MASTER: ResumeData = {
  basics: {
    name: "Priya Sharma",
    headline: "Data Analyst",
    email: "priya@example.com",
    phone: "+1 415 555 0101",
    location: { city: "Austin", region: "TX", country: "United States" },
    links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/priya-sharma" }],
  },
  summary: "Data analyst with 4 years of experience turning messy data into decisions using SQL, Python and Tableau.",
  skills: [
    { group: "Core", items: ["SQL", "Python", "Tableau", "Excel"] },
    { group: "Tools", items: ["dbt", "Snowflake"] },
  ],
  experience: [
    {
      id: "exp_1",
      company: "Northwind Analytics",
      title: "Data Analyst",
      location: "Austin, TX",
      startDate: "2023-02",
      endDate: null,
      bullets: [
        { id: "exp_1_b1", text: "Built Tableau dashboards that cut weekly reporting time by 35%." },
        { id: "exp_1_b2", text: "Optimized SQL pipelines in Snowflake, reducing costs by 18%." },
        { id: "exp_1_b3", text: "Partnered with product managers to design A/B test analyses." },
      ],
      technologies: ["SQL", "Tableau", "Snowflake", "Looker"],
    },
    {
      id: "exp_2",
      company: "Contoso Retail",
      title: "Junior Data Analyst",
      location: "Dallas, TX",
      startDate: "2021-06",
      endDate: "2023-01",
      bullets: [
        { id: "exp_2_b1", text: "Automated Excel inventory reports with Python, saving 6 analyst hours a week." },
        { id: "exp_2_b2", text: "Cleaned and modeled sales data for 120 stores." },
      ],
      technologies: ["Python", "Excel", "pandas"],
    },
    {
      id: "exp_3",
      company: "Fabrikam",
      title: "Data Intern",
      startDate: "2020-06",
      endDate: "2020-08",
      bullets: [{ id: "exp_3_b1", text: "Prepared survey data for the research team." }],
      technologies: [],
    },
  ],
  projects: [],
  education: [{ id: "edu_1", institution: "University of Texas at Austin", degree: "B.S.", field: "Statistics", endDate: "2021" }],
  certifications: [{ name: "Tableau Desktop Specialist", issuer: "Tableau", date: "2022-05" }],
  awards: [],
  languages: [{ name: "English", level: "Fluent" }],
  meta: { hiddenSections: [] },
};

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const ANALYSIS: JdAnalysisData = {
  requiredSkills: ["SQL", "Python", "Tableau", "Looker"],
  niceToHaveSkills: ["dbt", "Airflow"],
  keywords: ["dashboards", "A/B testing", "stakeholder management", "data pipelines"],
  seniority: "Mid",
  responsibilitiesSummary: "Own analytics for the growth team.",
  titleKeywords: ["data", "analyst"],
};

export const JD_TEXT =
  "We are looking for a Data Analyst to join our growth team. You will build dashboards in Looker and Tableau, write production SQL, " +
  "and use Python to automate data pipelines. Experience with A/B testing and stakeholder management is required. Nice to have: dbt, Airflow. " +
  "You will partner with product managers and present insights to leadership every week.";
