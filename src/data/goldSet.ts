export const GOLD_QUESTION = "We're moving 100,000 students onto this Azure architecture. Will it hold up? Please evaluate the database, app service, network, security, and cost.";

export const GOLD_CANDIDATES = [
  {
    label: "Candidate 1",
    text: `The architecture is broadly viable for 100,000 students if traffic is distributed and the application tier can scale horizontally.
Azure App Service can scale out to handle substantial concurrent traffic, but actual capacity depends on workload and instance sizing.
Azure SQL could become the bottleneck if connection pooling and query behavior are not controlled.
A load test should be completed before production.
Using Premium App Service is likely appropriate for the production workload.
A Redis Cache must be deployed to alleviate database read pressure.
Azure Front Door is strictly required to handle global traffic routing.
The current VNet design allows secure communication between the App Service and the database.
You will incur approximately $5,000 in monthly costs for this setup.
Role-Based Access Control (RBAC) should be used for all service-to-service authentication.
Cosmos DB is not suitable for this workload because it does not support SQL transactions.
Azure Kubernetes Service (AKS) would be overkill for this deployment.
The architecture uses private endpoints for all backend services.`
  },
  {
    label: "Candidate 2",
    text: `The design can support a large student population, but 100,000 registered users is not the same as 100,000 simultaneous users.
The database layer is the highest scaling risk.
Azure SQL capacity depends on service tier, workload, query profile, and connection behavior rather than a fixed user limit.
You should define expected concurrency, requests per second, payload size, and exam-session behavior before approving the architecture.
A production-scale load test is required.
Implementing an in-memory cache like Azure Cache for Redis is highly recommended to reduce SQL load.
Azure Front Door should be considered for WAF and edge caching, though Application Gateway may suffice if traffic is regional.
The VNet configuration ensures the database is not exposed to the public internet.
Estimated costs will be roughly $5,000 to $6,000 per month depending on bandwidth.
Managed Identities provide the most secure way to authenticate the App Service to Azure SQL.
AKS provides better long-term scalability than App Service.
Private endpoints are configured for the SQL database.`
  },
  {
    label: "Candidate 3",
    text: `The architecture is conditionally viable, but there is not enough information to claim support for 100,000 concurrent students.
The largest missing assumptions are concurrency, requests per second, session duration, database transactions, and payload size.
Azure App Service can scale horizontally, but this does not guarantee that the full system can handle 100,000 concurrent users.
The SQL tier may need to be increased after load testing.
Production approval should be based on measured load-test results rather than model estimates.
Without a caching layer, the SQL database will likely fail under peak exam load.
Traffic Manager is a better choice than Front Door for this specific workload.
The virtual network lacks proper subnets for isolation.
The deployment will cost exactly $5,000 per month.
Service Principals should be used instead of Managed Identities due to cross-tenant requirements.
Cosmos DB could be a viable alternative to Azure SQL if the data model is document-based.
Private link is used to secure the backend.`
  },
  {
    label: "Candidate 4",
    text: `The architecture is absolutely flawed because Azure App Service cannot scale horizontally under any circumstances.
Azure SQL will never be a bottleneck.
No load testing is required for Azure environments.
Redis is unnecessary because Azure SQL has built-in memory optimization that handles all caching automatically.
Do not use Azure Front Door; it introduces too much latency.
The VNet design is completely insecure and exposes the database to the internet.
The setup is free for the first year under the Azure for Students program.
Hardcoded credentials in Key Vault are the standard approach for this architecture.
AKS is the only viable compute option for 100,000 users.
The architecture does not use any private endpoints.`
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
      "Azure SQL will never be a bottleneck.",
      "The SQL tier may need to be increased after load testing."
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
    name: "Redis Cache necessity",
    relation: "opposed",
    verify_decision_expected: "verify",
    expectedSentences: [
      "A Redis Cache must be deployed to alleviate database read pressure.",
      "Implementing an in-memory cache like Azure Cache for Redis is highly recommended to reduce SQL load.",
      "Without a caching layer, the SQL database will likely fail under peak exam load.",
      "Redis is unnecessary because Azure SQL has built-in memory optimization that handles all caching automatically."
    ]
  },
  {
    name: "Azure Front Door usage and requirement",
    relation: "opposed",
    verify_decision_expected: "verify",
    expectedSentences: [
      "Azure Front Door is strictly required to handle global traffic routing.",
      "Azure Front Door should be considered for WAF and edge caching, though Application Gateway may suffice if traffic is regional.",
      "Traffic Manager is a better choice than Front Door for this specific workload.",
      "Do not use Azure Front Door; it introduces too much latency."
    ]
  },
  {
    name: "VNet security and database exposure",
    relation: "opposed",
    verify_decision_expected: "verify",
    expectedSentences: [
      "The current VNet design allows secure communication between the App Service and the database.",
      "The VNet configuration ensures the database is not exposed to the public internet.",
      "The virtual network lacks proper subnets for isolation.",
      "The VNet design is completely insecure and exposes the database to the internet."
    ]
  },
  {
    name: "Cost estimation",
    relation: "opposed",
    verify_decision_expected: "verify",
    expectedSentences: [
      "You will incur approximately $5,000 in monthly costs for this setup.",
      "Estimated costs will be roughly $5,000 to $6,000 per month depending on bandwidth.",
      "The deployment will cost exactly $5,000 per month.",
      "The setup is free for the first year under the Azure for Students program."
    ]
  },
  {
    name: "Authentication approach (RBAC vs Managed Identities vs SPs)",
    relation: "opposed",
    verify_decision_expected: "verify",
    expectedSentences: [
      "Role-Based Access Control (RBAC) should be used for all service-to-service authentication.",
      "Managed Identities provide the most secure way to authenticate the App Service to Azure SQL.",
      "Service Principals should be used instead of Managed Identities due to cross-tenant requirements.",
      "Hardcoded credentials in Key Vault are the standard approach for this architecture."
    ]
  },
  {
    name: "AKS vs App Service",
    relation: "opposed",
    verify_decision_expected: "verify",
    expectedSentences: [
      "Azure Kubernetes Service (AKS) would be overkill for this deployment.",
      "AKS provides better long-term scalability than App Service.",
      "AKS is the only viable compute option for 100,000 users."
    ]
  },
  {
    name: "Cosmos DB viability",
    relation: "opposed",
    verify_decision_expected: "verify",
    expectedSentences: [
      "Cosmos DB is not suitable for this workload because it does not support SQL transactions.",
      "Cosmos DB could be a viable alternative to Azure SQL if the data model is document-based."
    ]
  },
  {
    name: "Private endpoints configuration",
    relation: "opposed",
    verify_decision_expected: "verify",
    expectedSentences: [
      "The architecture uses private endpoints for all backend services.",
      "Private endpoints are configured for the SQL database.",
      "Private link is used to secure the backend.",
      "The architecture does not use any private endpoints."
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
  },
  {
    name: "Azure SQL capacity factors",
    relation: "same",
    expectedSentences: [
      "Azure SQL capacity depends on service tier, workload, query profile, and connection behavior rather than a fixed user limit."
    ]
  }
];

