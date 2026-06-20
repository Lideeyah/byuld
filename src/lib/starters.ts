// Starter project library — solves the blank-page problem. Each starter is a
// ready-to-build project a beginner can launch in one click, described in plain
// language. The `goal` text is what the planner reads to generate the build, so
// it's written clearly and concretely; everything else is for the picker UI.
import type { LucideIcon } from "lucide-react";
import { Handshake, Image, PiggyBank, Vote, Store, RefreshCw, HeartHandshake } from "lucide-react";

export type Difficulty = "Beginner" | "Intermediate";

export interface Starter {
  id: string;
  name: string;
  contractType: string;
  Icon: LucideIcon;
  difficulty: Difficulty;
  minutes: number;
  /** One plain-English sentence — no jargon. */
  blurb: string;
  /** Three things you'll understand by the end. */
  concepts: [string, string, string];
  /** Recommended as a first build. */
  recommended?: boolean;
  /** The concrete prompt the planner uses to design the build. */
  goal: string;
}

export const STARTERS: Starter[] = [
  {
    id: "escrow",
    name: "Escrow",
    contractType: "escrow",
    Icon: Handshake,
    difficulty: "Beginner",
    minutes: 15,
    recommended: true,
    blurb: "A safe way for two people to trade without trusting each other — money is held until both sides are happy.",
    concepts: ["Holding funds safely", "Who's allowed to act", "Releasing or refunding money"],
    goal: "A safe deposit between a buyer and a seller. The buyer puts money in, a neutral referee can release it to the seller or refund the buyer if there's a dispute.",
  },
  {
    id: "nft-collection",
    name: "NFT Collection",
    contractType: "nft-collection",
    Icon: Image,
    difficulty: "Beginner",
    minutes: 18,
    recommended: true,
    blurb: "Let people claim their own unique digital item — like minting a numbered ticket that's provably theirs.",
    concepts: ["Ownership of an item", "Creating new items (minting)", "Transferring to someone else"],
    goal: "An NFT collection where people can mint their own unique token. Each token has an owner, the creator controls minting, and owners can transfer their token to someone else.",
  },
  {
    id: "crowdfunding",
    name: "Crowdfunding",
    contractType: "crowdfunding",
    Icon: PiggyBank,
    difficulty: "Beginner",
    minutes: 18,
    blurb: "Raise money toward a goal — backers chip in, and funds only unlock if the target is reached.",
    concepts: ["Collecting contributions", "Tracking a funding goal", "Refunds if it falls short"],
    goal: "A crowdfunding campaign with a funding goal and deadline. Backers contribute money; if the goal is met the creator withdraws it, otherwise backers can get refunded.",
  },
  {
    id: "voting",
    name: "Voting System",
    contractType: "voting",
    Icon: Vote,
    difficulty: "Intermediate",
    minutes: 20,
    blurb: "Run a fair vote where everyone gets one say and no one can cheat or vote twice.",
    concepts: ["Registering voters", "One person, one vote", "Counting results fairly"],
    goal: "A voting system where an owner adds candidates, registered voters cast exactly one vote each, double-voting is prevented, and anyone can read the tallied results.",
  },
  {
    id: "marketplace",
    name: "Marketplace",
    contractType: "marketplace",
    Icon: Store,
    difficulty: "Intermediate",
    minutes: 22,
    blurb: "A simple shop where people list items for sale and buyers pay safely on-chain.",
    concepts: ["Listing items for sale", "Handling payments", "Transferring ownership on purchase"],
    goal: "A marketplace where sellers list items with a price, buyers purchase by paying the exact amount, the payment goes to the seller, and the item is marked sold.",
  },
  {
    id: "subscription",
    name: "Subscription",
    contractType: "subscription",
    Icon: RefreshCw,
    difficulty: "Intermediate",
    minutes: 20,
    blurb: "Charge a recurring fee for access — like a membership that stays active while it's paid.",
    concepts: ["Recurring payments", "Tracking active access", "Expiry and renewal"],
    goal: "A subscription contract where users pay a fee for a period of access, their active-until time is tracked, access expires when unpaid, and they can renew to extend it.",
  },
  {
    id: "donation",
    name: "Donation Platform",
    contractType: "donation",
    Icon: HeartHandshake,
    difficulty: "Beginner",
    minutes: 14,
    recommended: true,
    blurb: "Collect donations for a cause and let the organizer withdraw what's been raised.",
    concepts: ["Accepting any amount", "Tracking total raised", "Owner-only withdrawals"],
    goal: "A donation platform where anyone can donate any amount to a cause, the total raised and each donor's contribution are tracked, and only the organizer can withdraw the funds.",
  },
];
