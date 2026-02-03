/**
 * Guild Composition + Apollo Gateway
 *
 * Run: node guild-composition-apollo-gateway.mjs
 */

import { createServer } from "http";
import { createYoga } from "graphql-yoga";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { parse } from "graphql";
import { composeServices } from "@theguild/federation-composition";
import { ApolloGateway } from "@apollo/gateway";
import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";

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
console.log("Guild Composition + Apollo Gateway");
console.log("=".repeat(70));

const result = composeServices([subgraphA, subgraphB, subgraphC]);

if (result.errors?.length) {
  console.log();
  result.errors.forEach((e) => console.log(`[${e.extensions?.code}] ${e.message}`));
  console.log();
  process.exit(0);
}

console.log("Composition succeeded, starting gateway...\n");

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

const gateway = new ApolloGateway({ supergraphSdl: result.supergraphSdl });
const server = new ApolloServer({ gateway });
const { url } = await startStandaloneServer(server, { listen: { port: 4000 } });

console.log(`Gateway ready at ${url}`);

const response = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: `{ product(id: "1") { id creditCardNumber paymentReceipt } }` }),
});

console.log("\nQuery result:", JSON.stringify(await response.json(), null, 2));
process.exit(0);
