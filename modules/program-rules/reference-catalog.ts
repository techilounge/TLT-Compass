import type { departments } from "./contracts";
type Department = (typeof departments)[number];
type Section = [string, string, string, string];
const sections: Record<Department, Section[]> = {
  administrative: [
    [
      "Club Planning",
      "Help plan regular meetings, induction and investiture.",
      "Help coordinate annual and individual meeting schedules, including instruction, worships and trips.",
      "Develop the weekly meeting-place schedule, including camping weekends.",
    ],
    [
      "Worships",
      "Help develop worship themes, topics, guests and activities.",
      "Help schedule worships, prepare materials, invite and introduce speakers, thank them and prepare a backup.",
      "Coordinate worship opportunities with Teaching and Counseling for Pathfinder requirements.",
    ],
    [
      "Drill & Exercises",
      "Help units arrange opening and closing exercises and posting colors.",
      "Help teach basic marching and drill techniques.",
      "Develop, train and schedule an exhibition drill team.",
    ],
    [
      "On-Site Safety",
      "Help coordinate safety personnel and equipment at parking and building entrances.",
      "Help maintain contact with local emergency and police agencies.",
      "Develop equipment checkout and help store, maintain and repair safety equipment.",
    ],
  ],
  outreach: [
    [
      "Outreach Planning",
      "Help plan at least two outreach events, such as community service or Pathfinder Sabbath.",
      "Coordinate event programming with Administrative and Teaching Operations.",
      "Prepare alternative plans for weather, cancellation or other changes.",
    ],
    [
      "Logistics",
      "Help list, pack, account for, unpack and repair event materials and equipment.",
      "Help prepare an event menu and food supplies list when needed.",
      "Coordinate on-site and off-site safety with Administrative and Activities Operations.",
    ],
    [
      "Communications",
      "Help prepare, post and distribute event promotional materials.",
      "Help prepare and distribute event programs, menus, assignments and activity information.",
      "Prepare an event report with experiences and pictures for club, church, area and conference audiences.",
    ],
    [
      "Share Your Faith",
      "Practice clear public speaking and reading, including voice projection and clarity.",
      "Practice public prayer and learn different styles and purposes of prayer.",
      "Develop a three-minute personal testimony and share it with friends, family and staff.",
    ],
  ],
  teaching: [
    [
      "Instructional Planning",
      "Help plan and carry out Investiture Achievement instruction for the assigned period.",
      "Help choose and teach honors, including those required by Investiture Achievement.",
      "Coordinate with other operations to support Investiture Achievement requirements.",
    ],
    [
      "Logistics",
      "Help obtain teaching supplies and equipment and provide substitute or teaching assistance.",
      "Help set up teaching areas, distribute supplies, clean up and store remaining materials.",
      "Develop and pilot an honor and submit it to the NAD Honors Committee for approval.",
    ],
    [
      "Recruitment",
      "Help recruit Investiture Achievement and honor instructors.",
      "Give instructors requirements, resources, setting, timeframe and expected student numbers.",
      "Follow up with instructors, thank them, collect feedback and coordinate expense reimbursement.",
    ],
    [
      "Teaching",
      "Help teach an Investiture Achievement requirement as specified by Guide or Master Guide requirements.",
      "Help teach an honor as specified by Guide or Master Guide requirements.",
      "Develop lesson plans and handouts suited to participants' learning styles and share plans with club staff.",
    ],
  ],
  activities: [
    [
      "Event Planning",
      "Help plan at least two off-site events, such as camping, field or Pathfinder Bible Experience trips.",
      "Coordinate requirement instruction and event preparations, promotion, schedules, assignments, menus and activities.",
      "Help arrange event photography or video for reporting and promotion.",
    ],
    [
      "Logistics",
      "Help plan campsite layout and campsite setup.",
      "Help list, pack, account for, unpack and repair general club gear.",
      "Prepare alternative event plans for weather, cancellation or other changes.",
    ],
    [
      "Food",
      "Help develop the event menu and supplies list and purchase food and supplies.",
      "Help assign units to kitchen duties, food preparation, water and wash stations.",
      "Develop food safety guidelines, learn applicable food-handler requirements and obtain a permit if eligible.",
    ],
    [
      "Off-Site Safety",
      "Help arrange suitable safety at departure, the event site and return, including night watch when needed.",
      "Coordinate permission slips, fees and required paperwork with Records Operations and track group totals.",
      "Help arrange transportation, vehicle preparation, directions and communicated emergency policies and meeting points.",
    ],
  ],
  records: [
    [
      "Clerical",
      "Help keep attendance records and tally meeting and event totals for club reports.",
      "Help distribute and collect event permission slips.",
      "Help prepare and distribute applications, information, schedules, forms and club correspondence.",
    ],
    [
      "Reports",
      "Help report Investiture Achievement and honor completion, track awards and process uniform orders.",
      "Help submit monthly activity and attendance reports to church, area and conference leaders.",
      "Help prepare and post event documents, photos and reports on approved church or club websites.",
    ],
    [
      "Finances",
      "Learn how budgeting, collecting and accounting support Pathfinder ministry and practice stewardship.",
      "Help the treasurer collect money and issue receipts for fees, uniforms, trips, events and supplies.",
      "Help plan, collect and account for fundraising money.",
    ],
    [
      "Accounting",
      "Learn debit/credit accounting and help maintain records, monitor the annual budget and prepare monthly reports.",
      "Work with the church treasurer to learn club cash flow and payments for events, uniforms and resources.",
      "Help the treasurer account for reimbursements and accounts payable.",
    ],
  ],
  counseling: [
    [
      "Unit Planning",
      "Help plan and lead unit activities during regular meetings as directed by the counselor or director.",
      "Help plan and conduct an off-site unit day activity with Activities coordination for planning, logistics, food and safety.",
      "Help plan a unit camping trip with Activities coordination for planning, logistics, food and safety.",
    ],
    [
      "Club Trips",
      "Help lead unit activities on club camping trips, including setup, inspections, hikes, curfew and breaking camp.",
      "Help care for and post club flags and unit guidons during travel and at camp.",
      "Coordinate unit safety with Activities Operations and know first-aid kit locations and contents.",
    ],
    [
      "Teamwork",
      "Help counselors build cooperative unit teams through age-appropriate activities and club-approved unit identity.",
      "Help captains and scribes learn leadership responsibilities and support democratic group decisions.",
      "Encourage unit attention and completion of Investiture Achievement and honor requirements.",
    ],
    [
      "Personal Safety",
      "Help arrange proper adult supervision ratios and a unit buddy system.",
      "Learn and follow safety guidelines for work with minors and adults; seek approved volunteer status through the designated adult.",
      "Help manage an approved club social media presence under church and conference safety and communication policies.",
    ],
  ],
  special_1: [
    [
      "Club Requirements",
      "Choose a specialization with the TLT mentor and area coordinator or conference TLT council.",
      "Agree on four club-level training areas and tasks with increased responsibility; areas may span operations.",
      "If age 18, work with club staff as an associate staff member.",
    ],
    [
      "Project",
      "Complete a project beyond the club's scope, approved in consultation with the mentor and area/conference TLT authority.",
      "Write a project and leadership-learning report and present it at the Operation Evaluation Review.",
      "Obtain a relevant leadership or life-skills certification, such as first aid, CPR or AED.",
    ],
    [
      "Training",
      "Attend Basic Staff Training workshops and fulfill the certification requirements.",
      "Complete a major portion of Master Guide curriculum; the source recommends Leadership Development requirements.",
      "Help instructors plan and teach four specialization workshops agreed by the conference TLT council.",
    ],
  ],
  special_2: [
    [
      "Club Requirements",
      "Choose a specialization with the TLT mentor and area coordinator or conference TLT council.",
      "Agree on four club-level training areas and tasks with increased responsibility; areas may span operations.",
      "If age 18, work with club staff as an associate staff member.",
    ],
    [
      "Project",
      "Complete a project beyond the club's scope, approved in consultation with the mentor and area/conference TLT authority.",
      "Write a project and leadership-learning report and present it at the Operation Evaluation Review.",
      "Obtain relevant leadership or life-skills certification, such as conference approval to teach or preach.",
    ],
    [
      "Training",
      "Attend seminars required for Master Guide New Skills Development.",
      "Complete a major portion of Master Guide curriculum; the source recommends remaining New Skills Development requirements.",
      "Help instructors plan and teach four specialization workshops agreed by the conference TLT council.",
    ],
  ],
};
export const catalogVersion = "record-book-provided-2026-10-11-v1";
export const referenceCatalog = (
  Object.entries(sections) as [Department, Section[]][]
).flatMap(([department, groups], index) => {
  const page = index + 12,
    source_page = `PDF p. ${page}; printed p. ${page - 2}`;
  const rows = groups.flatMap(([section, ...descriptions]) =>
    descriptions.map((description, i) => ({
      department_code: department,
      requirement_type: i < 2 ? ("required" as const) : ("optional" as const),
      description,
      source_page,
      source_section: `TLT_RecordBook.pdf · ${section} · item ${i + 1}`,
    })),
  );
  return [
    ...rows,
    ...[
      "Meet agreed deadlines.",
      "Work cooperatively without repeated prompting.",
      "Communicate effectively.",
      "Demonstrate a Christian spirit.",
    ].map((description, i) => ({
      department_code: department,
      requirement_type: "required" as const,
      description,
      source_page,
      source_section: `TLT_RecordBook.pdf · Expectations · item ${i + 1}`,
    })),
  ];
});
