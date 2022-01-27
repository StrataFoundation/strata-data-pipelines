import { CreateMetadataArgs, UpdateMetadataArgs, CreateMetadataV2Args, UpdateMetadataV2Args, MetadataData } from "@metaplex-foundation/mpl-token-metadata";


export default {
  programId: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  schema: new Map([
    ...MetadataData.SCHEMA,
    ...CreateMetadataV2Args.SCHEMA,
    ...CreateMetadataArgs.SCHEMA,
    ...UpdateMetadataV2Args.SCHEMA,
    ...UpdateMetadataArgs.SCHEMA
  ]),
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
    args: CreateMetadataArgs
  }, {
    name: "UpdateMetadata",
    index: 1,
    accounts: [
      "tokenMetadata",
      "updateAuthority",
    ],
    args: UpdateMetadataArgs
  }, {
    name: "CreateMetadataV2",
    index: 16,
    accounts: [
      "tokenMetadata",
      "mint",
      "mintAuthority",
      "payer",
      "updateAuthority"
    ],
    args: CreateMetadataV2Args
  }, {
    name: "UpdateMetadataV2",
    index: 15,
    accounts: [
      "tokenMetadata",
      "updateAuthority",
    ],
    args: UpdateMetadataV2Args
  }]
}
