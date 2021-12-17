import { METADATA_SCHEMA } from "@strata-foundation/spl-utils";

const schemaKeys =  [...METADATA_SCHEMA.keys()];

export default {
  programId: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  schema:  METADATA_SCHEMA,
  commands: [{
    name: "CreateMetadata",
    index: 0,
    accounts: [
      "tokenMetadata",
      "mint",
      "mintAuthority",
      "payer",
      "updateAuthority"
    ],
    args: schemaKeys[0]
  },{
    name: "UpdateMetadata",
    index: 1,
    accounts: [
      "tokenMetadata",
      "updateAuthority",
    ],
    args: schemaKeys[1]
  }]
}
