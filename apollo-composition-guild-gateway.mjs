/**
 * Apollo Composition + Guild Gateway (Hive Gateway)
 *
 * Run: node apollo-composition-guild-gateway.mjs
 */

import { createServer } from "http";
import { createYoga } from "graphql-yoga";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { parse } from "graphql";
import { composeServices } from "@apollo/composition";
import { createGatewayRuntime } from "@graphql-hive/gateway";

const subgraphA = {
  name: "a",
  url: "http://localhost:4001/graphql",
  typeDefs: parse(`
    extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])
    type Query { product(id: ID!): Product }
    type Product @key(fields: "id") {
      id: ID!
      creditCardNumber: String!
    }
  `),
};

const subgraphB = {
  name: "b",
  url: "http://localhost:4002/graphql",
  typeDefs: parse(`
    extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@external", "@requires"])
    type Product @key(fields: "id") {
      id: ID!
      creditCardNumber: String! @external
      paymentReceipt: String! @requires(fields: "creditCardNumber")
    }
  `),
};

const subgraphC = {
  name: "c",
  url: "http://localhost:4003/graphql",
  typeDefs: parse(`
    extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@override"])
    type Product @key(fields: "id") {
      id: ID!
      paymentReceipt: String! @override(from: "b")
    }
  `),
};

console.log("=".repeat(70));
console.log("Apollo Composition + Guild Gateway (Hive Gateway)");
console.log("=".repeat(70));

const result = composeServices([subgraphA, subgraphB, subgraphC]);

if (result.errors?.length) {
  console.log();
  result.errors.forEach((e) => console.log(`[${e.extensions?.code}] ${e.message}`));
  console.log();
  process.exit(0);
}

console.log("Composition succeeded, starting gateway...");

function startSubgraph(typeDefs, resolvers, port) {
  const yoga = createYoga({ schema: buildSubgraphSchema({ typeDefs, resolvers }) });
  const server = createServer(yoga);
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

await startSubgraph(subgraphA.typeDefs, {
  Query: { product: (_, { id }) => ({ id, creditCardNumber: "4111-1111-1111-1234" }) },
  Product: { __resolveReference: (ref) => ({ ...ref, creditCardNumber: "4111-1111-1111-1234" }) },
}, 4001);

await startSubgraph(subgraphB.typeDefs, {
  Product: { paymentReceipt: (p) => `Payment processed for card: ${p.creditCardNumber}` },
}, 4002);

await startSubgraph(subgraphC.typeDefs, {
  Product: { paymentReceipt: (p) => { console.log("C received:", p); return `Payment processed for card: ${p.creditCardNumber}`; } },
}, 4003);

const gateway = createGatewayRuntime({ supergraph: result.supergraphSdl });
const server = createServer(gateway);

server.listen(4000, async () => {
  console.log("Gateway ready at http://localhost:4000/graphql");

  const response = await fetch("http://localhost:4000/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: `{ product(id: "1") { id creditCardNumber paymentReceipt } }` }),
  });

  console.log("\nQuery result:", JSON.stringify(await response.json(), null, 2));
  process.exit(0);
});
