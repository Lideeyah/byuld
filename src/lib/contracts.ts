// ─── Contract templates and section definitions ────────────────────────────────
// Every contract type has sections the user writes one at a time.
// Each section has: id, title, description (plain English), scaffold hint, decision question.

export type ContractType = "ERC721" | "ERC20" | "payment" | "dao" | "custom";

export interface DecisionOption { label: string; value: string; description: string; }

export interface SectionDef {
  id: string;
  title: string;
  description: string;       // plain English what this section does
  scaffoldHint: string;      // the skeleton code with TODO comments
  decisionQuestion?: {
    question: string;
    options: DecisionOption[];
    key: string;             // stored in clarificationAnswers
  };
}

// ─── ERC-721: NFT Certificate ──────────────────────────────────────────────────

const ERC721_SECTIONS: SectionDef[] = [
  {
    id: "license-pragma",
    title: "License & Pragma",
    description: "Every Solidity file starts with two required lines: the license and the version.",
    scaffoldHint: `// SPDX-License-Identifier: MIT
// ↑ TODO: Keep this line exactly as is. MIT means your code is open-source.

// TODO: Write the Solidity version requirement below.
// It should start with "pragma solidity" followed by the version.
// Use ^0.8.19 — the ^ means "this version or higher".
// Hint: pragma solidity ^0.8.19;`,
  },
  {
    id: "imports",
    title: "Imports",
    description: "Import the OpenZeppelin library contracts that give you NFT functionality for free.",
    scaffoldHint: `// TODO: Import the three OpenZeppelin contracts you need.
// Each import is one line starting with: import "@openzeppelin/contracts/..."
//
// You need:
//   1. ERC721URIStorage — gives you the NFT standard + metadata storage
//      Path: @openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol
//
//   2. Counters — safely tracks how many tokens have been minted
//      Path: @openzeppelin/contracts/utils/Counters.sol
//
//   3. Ownable — adds "only the owner can call this" protection
//      Path: @openzeppelin/contracts/access/Ownable.sol
//
// Format: import "@openzeppelin/contracts/path/To/Contract.sol";`,
    decisionQuestion: {
      key: "transferable",
      question: "Should your certificates be transferable between users, or locked to the person who earned them?",
      options: [
        { label: "Transferable", value: "true", description: "Recipients can sell or give away their certificate" },
        { label: "Non-transferable (Soulbound)", value: "false", description: "Certificate is permanently locked to the recipient — cannot be moved" },
      ],
    },
  },
  {
    id: "contract-declaration",
    title: "Contract Declaration",
    description: "Declare your contract and what it inherits from OpenZeppelin.",
    scaffoldHint: `// TODO: Declare your contract.
// Format: contract YourContractName is ERC721URIStorage, Ownable {
// Replace "YourContractName" with a name (no spaces, starts with capital letter).
// The "is" means your contract inherits all features from those OpenZeppelin contracts.
//
// Inside the contract, add:
//   using Counters for Counters.Counter;   <- enables the counter methods
//   Counters.Counter private _tokenIds;    <- tracks token count

// TODO: Write the constructor inside the curly braces.
// Format: constructor() ERC721("Your Collection Name", "SYMBOL") Ownable(msg.sender) {}
// Replace the name and symbol with your own.
// msg.sender = whoever deploys this contract becomes the owner.`,
  },
  {
    id: "mint-function",
    title: "Mint Function",
    description: "The mint function creates a new certificate and assigns it to a specific address.",
    scaffoldHint: `// TODO: Write the mint function.
// The function signature:
//   function mint(address to, string memory tokenURI) external onlyOwner {
//
// Inside the function, you need to:
//   1. Increment the token counter:       _tokenIds.increment();
//   2. Get the new token ID:              uint256 newTokenId = _tokenIds.current();
//   3. Mint the token to the address:     _safeMint(to, newTokenId);
//   4. Set the token's metadata URL:      _setTokenURI(newTokenId, tokenURI);
//
// The "onlyOwner" modifier means ONLY you (the deployer) can call this.
// "address to" is the wallet address that will receive the certificate.
// "tokenURI" is a URL pointing to the certificate's image and metadata.`,
  },
  {
    id: "transfer-override",
    title: "Transfer Override",
    description: "If your certificates are soulbound (non-transferable), add a transfer block here.",
    scaffoldHint: `// This section depends on your earlier decision about transferability.
//
// IF you want SOULBOUND (non-transferable) certificates:
// TODO: Override the transfer function to block all transfers.
//
//   function _beforeTokenTransfer(
//     address from,
//     address to,
//     uint256 tokenId,
//     uint256 batchSize
//   ) internal override {
//     require(from == address(0), "Certificates are non-transferable");
//     // ↑ address(0) means "minting" — we allow mint but block all transfers
//     super._beforeTokenTransfer(from, to, tokenId, batchSize);
//   }
//
// IF you want TRANSFERABLE certificates:
// TODO: Write a comment explaining this was an intentional choice:
//   // Transfers are enabled by default via ERC721. No override needed.`,
  },
  {
    id: "withdraw",
    title: "Withdraw Function",
    description: "Allow the owner to withdraw any ETH collected by the contract.",
    scaffoldHint: `// TODO: Write a withdraw function so the owner can collect any ETH.
//
// Function signature:
//   function withdraw() external onlyOwner {
//
// Inside:
//   payable(owner()).transfer(address(this).balance);
//   // ↑ Sends ALL ETH held by this contract to the owner's wallet
//
// Also add a receive function so the contract can accept ETH:
//   receive() external payable {}
//   // ↑ Without this, the contract will reject incoming ETH payments`,
  },
];

// ─── ERC-20: Community Token ──────────────────────────────────────────────────

const ERC20_SECTIONS: SectionDef[] = [
  {
    id: "license-pragma",
    title: "License & Pragma",
    description: "Required file header — license and Solidity version.",
    scaffoldHint: `// SPDX-License-Identifier: MIT
// TODO: Add the Solidity version below.
// Use: pragma solidity ^0.8.19;`,
  },
  {
    id: "imports",
    title: "Imports",
    description: "Import OpenZeppelin's token standard and access control.",
    scaffoldHint: `// TODO: Import two OpenZeppelin contracts:
//
//   1. ERC20 — the fungible token standard
//      Path: @openzeppelin/contracts/token/ERC20/ERC20.sol
//
//   2. Ownable — owner-only functions
//      Path: @openzeppelin/contracts/access/Ownable.sol
//
// Format: import "@openzeppelin/contracts/path/To/Contract.sol";`,
  },
  {
    id: "contract-declaration",
    title: "Contract Declaration & Constructor",
    description: "Declare your token contract with name, symbol, and initial supply.",
    scaffoldHint: `// TODO: Declare your token contract.
// Format: contract YourTokenName is ERC20, Ownable {
//
// Inside, add a MAX_SUPPLY constant:
//   uint256 public constant MAX_SUPPLY = 1_000_000 * 10 ** 18;
//   // ↑ 1 million tokens. 10**18 because Solidity uses whole numbers — 1 token = 10^18 units.
//
// TODO: Write the constructor:
//   constructor() ERC20("Token Name", "SYMBOL") Ownable(msg.sender) {
//     _mint(msg.sender, 100_000 * 10 ** 18); // Mint initial supply to deployer
//   }`,
    decisionQuestion: {
      key: "burnable",
      question: "Should token holders be able to burn (permanently destroy) their own tokens?",
      options: [
        { label: "Yes, burnable", value: "true", description: "Users can reduce their own balance permanently — good for deflationary mechanics" },
        { label: "No, fixed supply only", value: "false", description: "Tokens can only be created by the owner, never destroyed" },
      ],
    },
  },
  {
    id: "mint-function",
    title: "Mint Function",
    description: "Only the owner can create new tokens, up to the maximum supply.",
    scaffoldHint: `// TODO: Write the mint function.
// Only the owner should be able to mint new tokens.
//
// Function signature:
//   function mint(address to, uint256 amount) external onlyOwner {
//
// Inside:
//   1. Check max supply won't be exceeded:
//      require(totalSupply() + amount <= MAX_SUPPLY, "Would exceed max supply");
//   2. Mint the tokens:
//      _mint(to, amount);`,
  },
  {
    id: "burn-function",
    title: "Burn Function",
    description: "Allow token holders to permanently destroy their own tokens.",
    scaffoldHint: `// TODO: Write the burn function (if you chose to allow burning).
//
// Function signature:
//   function burn(uint256 amount) external {
//
// Inside:
//   _burn(msg.sender, amount);
//   // ↑ msg.sender = the person calling this function
//   // They are burning their OWN tokens — they can't burn someone else's.
//
// If you chose NOT to allow burning, write a comment explaining:
//   // Burning is disabled for this token. Supply can only be reduced by the owner.`,
  },
  {
    id: "security",
    title: "Emergency Controls",
    description: "Add a pause mechanism so you can halt transfers in an emergency.",
    scaffoldHint: `// TODO: Add a pause flag and control function.
//
// State variable (add above the constructor):
//   bool public paused = false;
//
// Pause toggle function:
//   function setPaused(bool _paused) external onlyOwner {
//     paused = _paused;
//   }
//
// Transfer hook to enforce the pause:
//   function _update(address from, address to, uint256 value) internal override {
//     require(!paused || from == address(0), "Transfers are paused");
//     // ↑ from == address(0) means it's a mint — still allow minting when paused
//     super._update(from, to, value);
//   }`,
  },
];

// ─── Payment Contract ─────────────────────────────────────────────────────────

const PAYMENT_SECTIONS: SectionDef[] = [
  {
    id: "license-pragma",
    title: "License & Pragma",
    description: "Required file header.",
    scaffoldHint: `// SPDX-License-Identifier: MIT
// TODO: Add pragma solidity ^0.8.19;`,
  },
  {
    id: "state-variables",
    title: "State Variables",
    description: "Track the owner and user balances on-chain.",
    scaffoldHint: `// TODO: Declare your contract and state variables.
// contract PaymentContract {
//
//   address public owner;      // Who deployed this contract
//   mapping(address => uint256) public balances;  // Each user's balance
//
//   constructor() {
//     owner = msg.sender;      // Set the deployer as the owner
//   }
// }`,
  },
  {
    id: "deposit",
    title: "Deposit Function",
    description: "Let users send ETH to the contract and have it recorded to their balance.",
    scaffoldHint: `// TODO: Write the deposit function.
// Anyone can deposit ETH by calling this function.
//
// Function signature:
//   function deposit() external payable {
//   // "payable" means this function can receive ETH
//
// Inside:
//   balances[msg.sender] += msg.value;
//   // ↑ msg.value = how much ETH was sent with the transaction
//   // Add it to the sender's balance in the mapping`,
  },
  {
    id: "withdraw",
    title: "Withdraw Function",
    description: "Let users withdraw their own funds — with reentrancy protection.",
    scaffoldHint: `// TODO: Write a SAFE withdraw function.
// WARNING: The order of operations here is critical for security.
//
// Function signature:
//   function withdraw(uint256 amount) external {
//
// Inside — follow the Checks-Effects-Interactions pattern:
//   1. CHECK: Verify they have enough balance
//      require(balances[msg.sender] >= amount, "Insufficient balance");
//
//   2. EFFECT: Update the balance BEFORE sending money
//      balances[msg.sender] -= amount;
//      // ↑ This must happen BEFORE the transfer — otherwise reentrancy attack is possible
//
//   3. INTERACT: Now send the money
//      payable(msg.sender).transfer(amount);`,
  },
  {
    id: "balance-getter",
    title: "Balance Getter",
    description: "A read-only function to check any address's balance.",
    scaffoldHint: `// TODO: Write a function to check an address's balance.
// This is a "view" function — it doesn't change anything, just reads data.
//
// Function signature:
//   function getBalance(address user) external view returns (uint256) {
//
// Inside:
//   return balances[user];
//   // ↑ Returns the balance stored for that address`,
  },
];

// ─── DAO: Simple Voting ──────────────────────────────────────────────────────

const DAO_SECTIONS: SectionDef[] = [
  {
    id: "license-pragma",
    title: "License & Pragma",
    description: "Required file header.",
    scaffoldHint: `// SPDX-License-Identifier: MIT
// TODO: Add pragma solidity ^0.8.19;`,
  },
  {
    id: "state-variables",
    title: "State Variables",
    description: "Store proposals and track who voted on what.",
    scaffoldHint: `// TODO: Define the Proposal struct and state variables.
//
// struct Proposal {
//   string description;      // What are we voting on?
//   uint256 voteCount;       // How many votes does it have?
//   bool executed;           // Has it been carried out?
// }
//
// Proposal[] public proposals;   // List of all proposals
// mapping(address => mapping(uint256 => bool)) public hasVoted;
// // ↑ hasVoted[voterAddress][proposalIndex] = true if they voted
//
// address public owner;
// constructor() { owner = msg.sender; }`,
  },
  {
    id: "create-proposal",
    title: "Create Proposal",
    description: "Only the owner can create new proposals for voting.",
    scaffoldHint: `// TODO: Write the createProposal function.
// Only the owner should be able to create proposals.
//
// Function signature:
//   function createProposal(string memory description) external {
//     require(msg.sender == owner, "Only owner can create proposals");
//
// Inside:
//   proposals.push(Proposal({
//     description: description,
//     voteCount: 0,
//     executed: false
//   }));`,
  },
  {
    id: "vote",
    title: "Vote Function",
    description: "Allow members to vote on proposals — one vote per address per proposal.",
    scaffoldHint: `// TODO: Write the vote function.
//
// Function signature:
//   function vote(uint256 proposalIndex) external {
//
// Inside:
//   1. Check the proposal exists:
//      require(proposalIndex < proposals.length, "Invalid proposal");
//
//   2. Check they haven't voted already:
//      require(!hasVoted[msg.sender][proposalIndex], "Already voted");
//
//   3. Record their vote:
//      hasVoted[msg.sender][proposalIndex] = true;
//      proposals[proposalIndex].voteCount++;`,
  },
  {
    id: "execute-proposal",
    title: "Execute Proposal",
    description: "Execute a proposal once it has enough votes.",
    scaffoldHint: `// TODO: Write the executeProposal function.
// Only the owner can execute. Proposals need a minimum number of votes.
//
// Function signature:
//   function executeProposal(uint256 proposalIndex) external {
//     require(msg.sender == owner, "Only owner can execute");
//     require(proposalIndex < proposals.length, "Invalid proposal");
//
//   Proposal storage proposal = proposals[proposalIndex];
//   require(!proposal.executed, "Already executed");
//   require(proposal.voteCount >= 2, "Not enough votes"); // minimum threshold
//
//   proposal.executed = true;
//   // ↑ In a real DAO you'd put the actual action here (transfer funds, change config, etc.)
//   // For now, marking as executed is enough for the MVP`,
  },
];

// ─── Custom Contract ──────────────────────────────────────────────────────────

const CUSTOM_SECTIONS: SectionDef[] = [
  {
    id: "license-pragma",
    title: "License & Pragma",
    description: "Required file header.",
    scaffoldHint: `// SPDX-License-Identifier: MIT
// TODO: Add pragma solidity ^0.8.19;`,
  },
  {
    id: "state-variables",
    title: "State Variables",
    description: "Define the data your contract stores permanently on the blockchain.",
    scaffoldHint: `// TODO: Declare your contract and the data it needs to store.
// contract YourContractName {
//
// Common variable types:
//   uint256 — a positive number (e.g. a price or count)
//   address — a wallet or contract address
//   bool    — true or false
//   string  — text
//   mapping(address => uint256) — a lookup table (like a dictionary)
//
// Add the variables your contract needs:
//   address public owner;
//   constructor() { owner = msg.sender; }`,
  },
  {
    id: "core-function-1",
    title: "Core Function 1",
    description: "Write the first main action your contract can perform.",
    scaffoldHint: `// TODO: Write your first core function.
// Think about: what is the main action this contract enables?
//
// Function structure:
//   function functionName(parameters) [visibility] [modifiers] [returns (type)] {
//     // your code here
//   }
//
// Visibility options:
//   public  — anyone can call it
//   external — only external callers (not the contract itself)
//   private — only this contract
//   internal — this contract and contracts that inherit it
//
// Modifiers you might want:
//   payable — can receive ETH
//   view    — only reads data, doesn't change anything`,
  },
  {
    id: "core-function-2",
    title: "Core Function 2",
    description: "Write the second main action your contract can perform.",
    scaffoldHint: `// TODO: Write your second core function.
// This is often the "read" counterpart to your first function.
//
// For example:
//   If function 1 stores data → function 2 retrieves it
//   If function 1 deposits ETH → function 2 withdraws it
//   If function 1 creates something → function 2 deletes or transfers it`,
  },
  {
    id: "events",
    title: "Events",
    description: "Events log important actions to the blockchain — cheap to store, easy to track.",
    scaffoldHint: `// TODO: Define events for your contract's key actions.
// Events are declared at the contract level (before functions).
//
// Format:
//   event EventName(address indexed who, uint256 amount);
//
// "indexed" means you can search/filter by that field later.
//
// Emit events inside your functions when something important happens:
//   emit EventName(msg.sender, 100);
//
// Add at least one event for your main action.`,
  },
];

// ─── Registry ─────────────────────────────────────────────────────────────────

export const CONTRACT_SECTIONS: Record<ContractType, SectionDef[]> = {
  ERC721:  ERC721_SECTIONS,
  ERC20:   ERC20_SECTIONS,
  payment: PAYMENT_SECTIONS,
  dao:     DAO_SECTIONS,
  custom:  CUSTOM_SECTIONS,
};

export function getSections(contractType: ContractType): SectionDef[] {
  return CONTRACT_SECTIONS[contractType] ?? CUSTOM_SECTIONS;
}

export function getSectionDef(contractType: ContractType, sectionId: string): SectionDef | undefined {
  return getSections(contractType).find(s => s.id === sectionId);
}
