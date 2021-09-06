import { kafka } from "../setup/kafka";
import { connection } from "../setup/solana";
import { Keypair, PublicKey, sendAndConfirmTransaction, SystemInstruction, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, Token, MintLayout } from "@solana/spl-token";
import { deserializeUnchecked } from 'borsh';
import "./borsh";

const { KAFKA_GROUP_ID, KAFKA_INPUT_TOPIC, SERVICE_ACCOUNT } = process.env

const serviceAccount = Keypair.fromSecretKey( new Uint8Array(JSON.parse(SERVICE_ACCOUNT!)));

const METADATA_PREFIX = 'metadata';
const EDITION = 'edition';
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export async function getMetadata(
  tokenMint: PublicKey,
): Promise<PublicKey> {
  return (
    await PublicKey.findProgramAddress(
      [
        Buffer.from(METADATA_PREFIX),
        METADATA_PROGRAM_ID.toBuffer(),
        tokenMint.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    )
  )[0];
}

async function getEdition(
  tokenMint: PublicKey,
): Promise<PublicKey> {
  return (
    await PublicKey.findProgramAddress(
      [
        Buffer.from(METADATA_PREFIX),
        METADATA_PROGRAM_ID.toBuffer(),
        tokenMint.toBuffer(),
        Buffer.from(EDITION),
      ],
      METADATA_PROGRAM_ID,
    )
  )[0];
}

async function getEditionMarkPda(
  mint: PublicKey,
  edition: BN,
): Promise<PublicKey> {
  const editionNumber = Math.floor(edition.toNumber() / 248);

  return (
    await PublicKey.findProgramAddress(
      [
        Buffer.from(METADATA_PREFIX),
        METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from(EDITION),
        Buffer.from(editionNumber.toString()),
      ],
      METADATA_PROGRAM_ID,
    )
  )[0];
}

enum MetadataKey {
  Uninitialized = 0,
  MetadataV1 = 4,
  EditionV1 = 1,
  MasterEditionV1 = 2,
  MasterEditionV2 = 6,
  EditionMarker = 7,
}

class Creator {
  address: String;
  verified: boolean;
  share: number;

  constructor(args: {
    address: String;
    verified: boolean;
    share: number;
  }) {
    this.address = args.address;
    this.verified = args.verified;
    this.share = args.share;
  }
}

class Data {
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  creators: Creator[] | null;
  constructor(args: {
    name: string;
    symbol: string;
    uri: string;
    sellerFeeBasisPoints: number;
    creators: Creator[] | null;
  }) {
    this.name = args.name;
    this.symbol = args.symbol;
    this.uri = args.uri;
    this.sellerFeeBasisPoints = args.sellerFeeBasisPoints;
    this.creators = args.creators;
  }
}

class Metadata {
  key: MetadataKey;
  updateAuthority: String;
  mint: String;
  data: Data;
  primarySaleHappened: boolean;
  isMutable: boolean;
  editionNonce: number | null;

  // set lazy
  masterEdition?: String;
  edition?: String;

  constructor(args: {
    updateAuthority: String;
    mint: String;
    data: Data;
    primarySaleHappened: boolean;
    isMutable: boolean;
    editionNonce: number | null;
  }) {
    this.key = MetadataKey.MetadataV1;
    this.updateAuthority = args.updateAuthority;
    this.mint = args.mint;
    this.data = args.data;
    this.primarySaleHappened = args.primarySaleHappened;
    this.isMutable = args.isMutable;
    this.editionNonce = args.editionNonce;
  }

  public async init() {
    const edition = await getEdition(new PublicKey(this.mint));
    this.edition = edition.toBase58();
    this.masterEdition = edition.toBase58();
  }
}

const METADATA_SCHEMA = new Map<any, any>([
  [
    Metadata,
    {
      kind: 'struct',
      fields: [
        ['key', 'u8'],
        ['updateAuthority', 'pubkeyAsString'],
        ['mint', 'pubkeyAsString'],
        ['data', Data],
        ['primarySaleHappened', 'u8'], // bool
        ['isMutable', 'u8'], // bool
      ],
    },
  ],
  [
    Data,
    {
      kind: 'struct',
      fields: [
        ['name', 'string'],
        ['symbol', 'string'],
        ['uri', 'string'],
        ['sellerFeeBasisPoints', 'u16'],
        ['creators', { kind: 'option', type: [Creator] }],
      ],
    },
  ],
  [
    Creator,
    {
      kind: 'struct',
      fields: [
        ['address', 'pubkeyAsString'],
        ['verified', 'u8'],
        ['share', 'u8'],
      ],
    },
  ],
]);


const METADATA_REPLACE = new RegExp('\u0000', 'g');
const decodeMetadata = (buffer: Buffer): Metadata => {
  const metadata = deserializeUnchecked(
    METADATA_SCHEMA,
    Metadata,
    buffer,
  ) as Metadata;
  metadata.data.name = metadata.data.name.replace(METADATA_REPLACE, '');
  metadata.data.uri = metadata.data.uri.replace(METADATA_REPLACE, '');
  metadata.data.symbol = metadata.data.symbol.replace(METADATA_REPLACE, '');
  return metadata;
};

async function mintNewEditionFromMasterEditionViaTokenInstruction(
  newMint: PublicKey,
  tokenMint: PublicKey,
  newMintAuthority: PublicKey,
  newUpdateAuthority: PublicKey,
  tokenOwner: PublicKey,
  tokenAccount: PublicKey,
  payer: PublicKey,
  edition: BN,
): Promise<TransactionInstruction> {
  const metadataProgramId = METADATA_PROGRAM_ID;

  const newMetadataKey = await getMetadata(newMint);
  const masterMetadataKey = await getMetadata(tokenMint);
  const newEdition = await getEdition(newMint);
  const masterEdition = await getEdition(tokenMint);
  const editionMarkPda = await getEditionMarkPda(tokenMint, edition);

  const data = Buffer.from([11, ...edition.toArray('le', 8)]);
  console.log(masterMetadataKey.toBase58());

  const keys = [
    {
      pubkey: newMetadataKey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: newEdition,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: masterEdition,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: newMint,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: editionMarkPda,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: newMintAuthority,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: payer,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: tokenOwner,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: tokenAccount,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: newUpdateAuthority,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: masterMetadataKey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: metadataProgramId,
    data,
  });
}

let currentEditions = new Map<string, number>();
async function getOrFindNextEdition(mint: PublicKey) {
  if (currentEditions.has(mint.toBase58())) {
    const next = currentEditions.get(mint.toBase58())! + 1
    currentEditions.set(mint.toBase58(), next)
    return next;
  }
  
  let currentEdition = 0;
  while (await connection.getAccountInfo(await getEditionMarkPda(mint, new BN(currentEdition)))) {
    currentEdition += 1;
  }
  currentEditions.set(mint.toBase58(), currentEdition + 1);

  return currentEdition + 1;
}

const metaToTokenCache = new Map<string, PublicKey>();
async function getMintFromMeta(meta: PublicKey): Promise<PublicKey> {
  if (metaToTokenCache.has(meta.toBase58())) {
    return metaToTokenCache.get(meta.toBase58())!;
  }
  const acct = await connection.getAccountInfo(meta);
  const trophyMasterEditionMetaAcct = await decodeMetadata(acct!.data);
  const ret = new PublicKey(trophyMasterEditionMetaAcct.mint);
  metaToTokenCache.set(meta.toBase58(), ret);

  return ret;
}

async function run() {
  const consumer = kafka.consumer({
    groupId: KAFKA_GROUP_ID!
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: KAFKA_INPUT_TOPIC!,
    fromBeginning: process.env["KAFKA_OFFSET_RESET"] === "earliest"
  });

  return new Promise((resolve, reject) => {
    consumer.run({
      eachBatch: async (args) => {
        try {
          const messages = args.batch.messages.map(m => JSON.parse(m.value!.toString()));
          await Promise.all(
            messages.map(async message => {
              const destination = new PublicKey(message.destination)
              const trophyMasterEditionMeta = new PublicKey(message.trophyMasterEditionMeta);
              const masterEditionMint = await getMintFromMeta(trophyMasterEditionMeta);
              const txn = new Transaction()
              const mint = Keypair.generate();
              const ata = await Token.getAssociatedTokenAddress(
                ASSOCIATED_TOKEN_PROGRAM_ID,
                TOKEN_PROGRAM_ID,
                mint.publicKey,
                destination
              );
              const masterEditionAta = await Token.getAssociatedTokenAddress(
                ASSOCIATED_TOKEN_PROGRAM_ID,
                TOKEN_PROGRAM_ID,
                masterEditionMint,
                serviceAccount.publicKey
              );
              const metadata = await getMetadata(mint.publicKey);
              console.log(`Sending trophy...`);
              
              txn.instructions = [
                SystemProgram.createAccount({
                  fromPubkey: serviceAccount.publicKey,
                  newAccountPubkey: mint.publicKey,
                  lamports: await Token.getMinBalanceRentForExemptMint(connection),
                  space: MintLayout.span,
                  programId: TOKEN_PROGRAM_ID
                }),
                Token.createInitMintInstruction(
                  TOKEN_PROGRAM_ID,
                  mint.publicKey,
                  0,
                  serviceAccount.publicKey,
                  null
                ),
                Token.createAssociatedTokenAccountInstruction(
                  ASSOCIATED_TOKEN_PROGRAM_ID,
                  TOKEN_PROGRAM_ID,
                  mint.publicKey,
                  ata,
                  destination,
                  serviceAccount.publicKey
                ),
                Token.createMintToInstruction(
                  TOKEN_PROGRAM_ID,
                  mint.publicKey,
                  ata,
                  serviceAccount.publicKey,
                  [],
                  1
                ),
                await mintNewEditionFromMasterEditionViaTokenInstruction(
                  mint.publicKey,
                  masterEditionMint,
                  serviceAccount.publicKey,
                  serviceAccount.publicKey,
                  serviceAccount.publicKey,
                  masterEditionAta,
                  serviceAccount.publicKey,
                  new BN(await getOrFindNextEdition(masterEditionMint))
                )
              ]
              const txid = await sendAndConfirmTransaction(connection, txn, [serviceAccount, mint])

              console.log(`Sent trophy ${message.trophyShortName}, trophy mint ${masterEditionMint.toBase58()}, trophy meta ${message.trophyMasterEdition} to ${destination.toBase58()} (${ata.toBase58()}) with mint ${mint.publicKey} and metadata ${metadata}, txid ${txid}`);
            })
          )
        } catch(e) {
          reject(e)
          throw e;
        }
      }
    })
  })
}

run().catch(e => {
  console.error(e);
  console.error(e.stack);
  process.exit(1);
})
