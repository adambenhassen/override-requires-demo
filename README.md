# @override + @requires Demo

Demonstrates why `@override` cannot be used on fields that have `@requires` in the source subgraph.

## The Problem

```graphql
# Subgraph B has @requires
type Product @key(fields: "id") {
  paymentReceipt: String! @requires(fields: "creditCardNumber")
}

# Subgraph C tries to @override without declaring its own @requires
type Product @key(fields: "id") {
  paymentReceipt: String! @override(from: "b")  # NO @requires!
}
```

If allowed, the supergraph loses the `@requires`:

```graphql
paymentReceipt: String! @join__field(graph: C, override: "b")
# NO @requires! Gateway won't fetch "creditCardNumber" first.
```

**Result:** C's resolver receives `{ id }` instead of `{ id, creditCardNumber }` -> `"Payment processed for card: undefined"`

## Run the Demos

```bash
pnpm install
```

| Composition | Gateway | Command |
|-------------|---------|---------|
| Apollo | Apollo | `npm run demo:apollo-apollo` |
| Apollo | Guild (Hive) | `npm run demo:apollo-guild` |
| Guild | Apollo | `npm run demo:guild-apollo` |
| Guild | Guild (Hive) | `npm run demo:guild-guild` |

## Results Comparison

| Composition | Gateway | Result |
|-------------|---------|--------|
| Apollo | Apollo | ✅ **Rejected at composition** |
| Apollo | Guild | ✅ **Rejected at composition** |
| Guild | Apollo | ⚠️ Composition succeeds, **Apollo Gateway rejects supergraph** |
| Guild | Guild | ❌ **BUG: Returns `"Payment processed for card: undefined"`** |

### Apollo Composition (+ any gateway)
Stops at composition with these errors:

```
[OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE] @override cannot be used on field
"Product.paymentReceipt" on subgraph "c" since "Product.paymentReceipt" on "b"
is marked with directive "@requires"

[INVALID_FIELD_SHARING] Non-shareable field "Product.paymentReceipt" is resolved
from multiple subgraphs: it is resolved from subgraphs "b" and "c" and defined as
non-shareable in all of them
```

### Guild Composition + Apollo Gateway
Composition succeeds, but Apollo Gateway rejects the supergraph at load time:

```
Composition succeeded, starting gateway...

Error: Unexpected error extracting subgraph "b" from the supergraph: this is either
a bug, or the supergraph has been corrupted.

Details:
[b] Field "Product.creditCardNumber" is marked @external but is not used in any federation
directive (@key, @provides, @requires) or to satisfy an interface
```

Apollo Gateway catches the invalid supergraph at load time.

### Guild Composition + Guild Gateway
composition succeeds and the gateway starts, but the query returns the wrong result:

```
Composition succeeded, starting gateway...

Gateway ready at http://localhost:4000/graphql
C received: { __typename: 'Product', id: '1' }

Query result: {
  "data": {
    "product": {
      "id": "1",
      "creditCardNumber": "4111-1111-1111-1234",
      "paymentReceipt": "Payment processed for card: undefined" <- BUG!
    }
  }
}
```

**This is the bug!** The `@requires` was lost, so `creditCardNumber` was never fetched for C's resolver.

## The Fix

Guild Composition needs to add the same validation as Apollo. See: https://github.com/graphql-hive/federation-composition/pull/232

## The Correct Migration Path

Don't use `@override`. Instead, remove the field from B and define it fresh in C:

```graphql
# Subgraph C, correct approach
type Product @key(fields: "id") {
  id: ID!
  creditCardNumber: String! @external
  paymentReceipt: String! @requires(fields: "creditCardNumber")
}
```
