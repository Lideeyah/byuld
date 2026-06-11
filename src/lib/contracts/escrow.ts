// ─── P2P Escrow Contract — the only contract type in V1 ─────────────────────────
// The scaffold is HARDCODED. The user fills in the blanks. The AI never writes it.
// `solution` is the reviewer's reference only — it is NEVER sent to the editor.

export interface EscrowSectionSecurityNote {
  severity: "critical" | "warning";
  title: string;
  explanation: string;
  historicalExample: string;
  fix: string;
}

export interface EscrowSection {
  id: "state" | "modifiers" | "deposit" | "resolution";
  title: string;
  description: string;
  founderExplanation: string;
  developerExplanation: string;
  scaffold: string;            // shown in the editor — signatures + TODO comments, empty bodies
  solution: string;            // reviewer reference ONLY — never shown to the user
  hint: string;
  securityNote: EscrowSectionSecurityNote | null;
  // Concrete, beginner-facing guidance: exactly what to type and why it matters.
  guide: {
    why: string;                       // plain-English reason this section exists
    steps: { do: string; code: string }[];  // each step: what to do + the exact line(s) to type
  };
}

export const ESCROW_CONTRACT = {
  id: "escrow",
  name: "P2P Escrow Contract",
  description: "A secure payment contract between a buyer, seller, and trusted arbiter",

  fullCorrectContract: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Escrow {
    enum State { Created, Locked, Released, Disputed }

    address public buyer;
    address public seller;
    address public arbiter;
    uint256 public amount;
    State public state;

    constructor(address _seller, address _arbiter) {
        buyer = msg.sender;
        seller = _seller;
        arbiter = _arbiter;
        state = State.Created;
    }

    modifier onlyBuyer() {
        require(msg.sender == buyer, "Only buyer can call this");
        _;
    }

    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Only arbiter can call this");
        _;
    }

    modifier inState(State _state) {
        require(state == _state, "Invalid state for this action");
        _;
    }

    function deposit() public payable onlyBuyer inState(State.Created) {
        amount = msg.value;
        state = State.Locked;
    }

    function release() public onlyBuyer inState(State.Locked) {
        state = State.Released;
        payable(seller).transfer(amount);
    }

    function dispute() public onlyArbiter inState(State.Locked) {
        state = State.Disputed;
        payable(buyer).transfer(amount);
    }
}`,

  sections: [
    {
      id: "state",
      title: "State Variables & Enums",
      description: "Define the parties involved and the stages this contract can be in",
      founderExplanation:
        "Before we write any rules, we need to define who is involved in the trade and what stages the payment can go through. Think of this like setting up the characters and the plot of a story before it begins.",
      developerExplanation:
        "We start by declaring the contract state machine. An enum defines the lifecycle stages. Address variables store the participant identities.",
      scaffold: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Escrow {

    // Byuld: An enum defines the possible stages of this contract.
    // Like a traffic light — the payment can only be in ONE stage at a time.
    // TODO: Define an enum called State with four values: Created, Locked, Released, Disputed


    // Byuld: These store the addresses (identities) of the three parties.
    // TODO: Declare three public address variables: buyer, seller, arbiter


    // Byuld: This tracks how much ETH is locked inside the contract.
    // TODO: Declare a public uint256 variable called 'amount'


    // Byuld: This tracks which stage the contract is currently in.
    // TODO: Declare a public State variable called 'state'

}`,
      solution: `    enum State { Created, Locked, Released, Disputed }

    address public buyer;
    address public seller;
    address public arbiter;
    uint256 public amount;
    State public state;`,
      hint: "An enum is like a list of allowed values. A State variable can only ever equal one of those values. An address is a 42-character identifier — like a wallet address.",
      securityNote: null,
      guide: {
        why: "These are the building blocks of your escrow — who's in the deal, how much money is held, and what stage it's at. Nothing else can work until they exist.",
        steps: [
          { do: "Under the first comment, list the four stages the payment can be in. Type:", code: "enum State { Created, Locked, Released, Disputed }" },
          { do: "Under the next comment, name the three people in the deal. Type each on its own line:", code: "address public buyer;\naddress public seller;\naddress public arbiter;" },
          { do: "Track how much ETH is held. Type:", code: "uint256 public amount;" },
          { do: "Track the current stage. Type:", code: "State public state;" },
        ],
      },
    },
    {
      id: "modifiers",
      title: "Access Control Modifiers",
      description: "Write the security guards that control who can call which functions",
      founderExplanation:
        "Now we write the security rules. These are like locks on doors — only certain people have the key to certain actions. Without these, anyone could release your funds to the wrong person.",
      developerExplanation:
        "Modifiers are reusable access control checks. They gate function execution based on msg.sender and contract state. We need three: onlyBuyer, onlyArbiter, and inState.",
      scaffold: `    // Byuld: A modifier runs a check BEFORE the function it is attached to.
    // If the check fails, the entire transaction is cancelled.
    // The underscore _ means "run the function here if the check passed".

    // TODO: Inside onlyBuyer, require that msg.sender == buyer.
    // If not, revert with the message: "Only buyer can call this"
    modifier onlyBuyer() {

        _;
    }

    // TODO: Inside onlyArbiter, require that msg.sender == arbiter.
    // If not, revert with the message: "Only arbiter can call this"
    modifier onlyArbiter() {

        _;
    }

    // TODO: Inside inState, require that state == _state.
    // If not, revert with the message: "Invalid state for this action"
    modifier inState(State _state) {

        _;
    }`,
      solution: `    modifier onlyBuyer() {
        require(msg.sender == buyer, "Only buyer can call this");
        _;
    }

    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Only arbiter can call this");
        _;
    }

    modifier inState(State _state) {
        require(state == _state, "Invalid state for this action");
        _;
    }`,
      hint: "require() takes two arguments: a condition that must be true, and an error message shown if it is false. msg.sender is the address of whoever is calling this function right now.",
      securityNote: null,
      guide: {
        why: "These are the locks on your contract's doors. They decide who is allowed to do what. Without them, anyone could release your funds to the wrong person.",
        steps: [
          { do: "Inside onlyBuyer, only let the buyer through. Type:", code: 'require(msg.sender == buyer, "Only buyer can call this");' },
          { do: "Inside onlyArbiter, only let the referee through. Type:", code: 'require(msg.sender == arbiter, "Only arbiter can call this");' },
          { do: "Inside inState, only allow the action at the right stage. Type:", code: 'require(state == _state, "Invalid state for this action");' },
        ],
      },
    },
    {
      id: "deposit",
      title: "Deposit Function",
      description: "Write the function that locks the payment into the contract",
      founderExplanation:
        "This is the function the buyer calls to put money into the escrow. Once they call it, the money is locked inside the contract — nobody can touch it until the buyer releases it or a dispute is raised.",
      developerExplanation:
        "The deposit function is payable, meaning it accepts ETH. It uses the onlyBuyer and inState(Created) modifiers to gate access. It stores msg.value and transitions state to Locked.",
      scaffold: `    // Byuld: This function is called by the buyer to lock funds into the escrow.
    // 'payable' means this function can receive ETH when it is called.
    // After it runs, the money is locked inside the contract.

    // TODO: Inside deposit, do two things in order:
    //   1. Set 'amount' equal to msg.value (the ETH sent with this call)
    //   2. Set 'state' to State.Locked
    function deposit() public payable onlyBuyer inState(State.Created) {


    }`,
      solution: `    function deposit() public payable onlyBuyer inState(State.Created) {
        amount = msg.value;
        state = State.Locked;
    }`,
      hint: "msg.value is the amount of ETH sent with the function call. State.Locked means funds are now held inside the contract.",
      securityNote: null,
      guide: {
        why: "This is how the buyer puts money in. After it runs, the funds are locked safely inside the contract until the deal is settled.",
        steps: [
          { do: "Record how much ETH the buyer just sent. Type:", code: "amount = msg.value;" },
          { do: "Move the contract into the Locked stage. Type:", code: "state = State.Locked;" },
        ],
      },
    },
    {
      id: "resolution",
      title: "Dispute Resolution & Safe Payout",
      description: "Write the functions that release or dispute the payment",
      founderExplanation:
        "This is the most important section — and the most dangerous. These functions move money. The order of operations matters critically. You must update the contract state BEFORE sending money. If you send money first, an attacker can call the function again before the state updates and drain everything.",
      developerExplanation:
        "Payout functions must follow the Checks-Effects-Interactions (CEI) pattern strictly. State transition must occur before any external call. Failure to do so creates a reentrancy vulnerability — the same pattern that caused the $60M DAO hack in 2016.",
      scaffold: `    // BYULD SECURITY WARNING
    // This section moves real money. Order of operations is critical.
    // ALWAYS update state BEFORE sending ETH (the Checks-Effects-Interactions pattern).
    // Breaking this is how the 2016 DAO hack drained $60 million.

    // TODO: Inside release (called by the buyer when happy with delivery):
    //   1. Set state to State.Released        (EFFECTS first)
    //   2. Send amount to seller: payable(seller).transfer(amount)   (INTERACTIONS last)
    function release() public onlyBuyer inState(State.Locked) {


    }

    // TODO: Inside dispute (called by the arbiter on a disagreement):
    //   1. Set state to State.Disputed         (EFFECTS first)
    //   2. Send amount back to buyer: payable(buyer).transfer(amount)  (INTERACTIONS last)
    function dispute() public onlyArbiter inState(State.Locked) {


    }
}`,
      solution: `    function release() public onlyBuyer inState(State.Locked) {
        state = State.Released;
        payable(seller).transfer(amount);
    }

    function dispute() public onlyArbiter inState(State.Locked) {
        state = State.Disputed;
        payable(buyer).transfer(amount);
    }`,
      hint: "Update state BEFORE transferring ETH. The state change must happen first. This prevents reentrancy attacks where an attacker calls the function again before the balance updates.",
      guide: {
        why: "These two functions move the money. The ORDER matters more than anything in this whole contract: always change the stage BEFORE sending ETH, or an attacker can drain everything.",
        steps: [
          { do: "In release — first mark the deal as Released. Type:", code: "state = State.Released;" },
          { do: "Then (after the state change) send the money to the seller. Type:", code: "payable(seller).transfer(amount);" },
          { do: "In dispute — first mark the deal as Disputed. Type:", code: "state = State.Disputed;" },
          { do: "Then refund the buyer. Type:", code: "payable(buyer).transfer(amount);" },
        ],
      },
      securityNote: {
        severity: "critical",
        title: "Reentrancy Vulnerability Risk",
        explanation:
          "If you send ETH before updating the state, an attacker can call this function again in the same transaction before the state changes. This lets them drain the entire contract balance.",
        historicalExample:
          "In 2016, the DAO hack exploited exactly this pattern. An attacker drained $60 million in ETH by calling a withdraw function recursively before the balance was updated.",
        fix: "Always set state = State.Released (or Disputed) BEFORE calling transfer(). This is the Checks-Effects-Interactions pattern.",
      },
    },
  ] as EscrowSection[],
};
