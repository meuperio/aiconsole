export const GOLD_QUESTION = "We're moving 100,000 students onto this Azure architecture. Will it hold up?";

export const GOLD_CANDIDATES = [
  {
    label: "Candidate 1",
    text: `The architecture is broadly viable for 100,000 students if traffic is distributed and the application tier can scale horizontally.
Azure App Service can scale out to handle substantial concurrent traffic, but actual capacity depends on workload and instance sizing.
Azure SQL could become the bottleneck if connection pooling and query behavior are not controlled.
A load test should be completed before production.
Using Premium App Service is likely appropriate for the production workload.`
  },
  {
    label: "Candidate 2",
    text: `The design can support a large student population, but 100,000 registered users is not the same as 100,000 simultaneous users.
The database layer is the highest scaling risk.
Azure SQL capacity depends on service tier, workload, query profile, and connection behavior rather than a fixed user limit.
You should define expected concurrency, requests per second, payload size, and exam-session behavior before approving the architecture.
A production-scale load test is required.`
  },
  {
    label: "Candidate 3",
    text: `The architecture is conditionally viable, but there is not enough information to claim support for 100,000 concurrent students.
The largest missing assumptions are concurrency, requests per second, session duration, database transactions, and payload size.
Azure App Service can scale horizontally, but this does not guarantee that the full system can handle 100,000 concurrent users.
The SQL tier may need to be increased after load testing.
Production approval should be based on measured load-test results rather than model estimates.`
  },
  {
    label: "Candidate 4",
    text: `The architecture is absolutely flawed because Azure App Service cannot scale horizontally under any circumstances.
Azure SQL will never be a bottleneck.
No load testing is required for Azure environments.`
  }
];

export interface GoldMerge {
  name: string;
  relation: "same" | "opposed" | "partial";
  verify_decision_expected?: string;
  expectedSentences: string[];
}

export const GOLD_MERGES: GoldMerge[] = [
  {
    name: "The database/SQL layer is the primary scaling risk",
    relation: "opposed",
    verify_decision_expected: "verify",
    expectedSentences: [
      "Azure SQL could become the bottleneck if connection pooling and query behavior are not controlled.",
      "The database layer is the highest scaling risk.",
      "Azure SQL will never be a bottleneck."
    ]
  },
  {
    name: "Azure App Service horizontal scaling capability",
    relation: "opposed",
    verify_decision_expected: "verify",
    expectedSentences: [
      "Azure App Service can scale out to handle substantial concurrent traffic, but actual capacity depends on workload and instance sizing.",
      "Azure App Service can scale horizontally, but this does not guarantee that the full system can handle 100,000 concurrent users.",
      "The architecture is absolutely flawed because Azure App Service cannot scale horizontally under any circumstances."
    ]
  },
  {
    name: "Load testing is required before production approval",
    relation: "opposed",
    verify_decision_expected: "verify",
    expectedSentences: [
      "A load test should be completed before production.",
      "A production-scale load test is required.",
      "Production approval should be based on measured load-test results rather than model estimates.",
      "No load testing is required for Azure environments."
    ]
  },
  {
    name: "Registered users are not the same as concurrent users",
    relation: "same",
    expectedSentences: [
      "The design can support a large student population, but 100,000 registered users is not the same as 100,000 simultaneous users."
    ]
  },
  {
    name: "Key concurrency assumptions are undefined",
    relation: "same",
    expectedSentences: [
      "You should define expected concurrency, requests per second, payload size, and exam-session behavior before approving the architecture.",
      "The largest missing assumptions are concurrency, requests per second, session duration, database transactions, and payload size."
    ]
  },
  {
    name: "Premium App Service tier is appropriate",
    relation: "same",
    verify_decision_expected: "verify",
    expectedSentences: [
      "Using Premium App Service is likely appropriate for the production workload."
    ]
  }
];
