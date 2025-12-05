# P2P Insurance FHE: Confidential Peer-to-Peer Insurance Claims

P2P Insurance FHE is a decentralized insurance protocol that leverages **Zama's Fully Homomorphic Encryption technology** to create a secure platform for confidential peer-to-peer insurance claims. Users can submit their claims and related evidence, all encrypted using Fully Homomorphic Encryption (FHE), ensuring their privacy is maintained throughout the claims process. An anonymous Decentralized Autonomous Organization (DAO) acts as the jury, casting private votes to determine the outcome of claims, thereby safeguarding user confidentiality.

## The Challenge of Traditional Insurance

The traditional insurance claims process often exposes sensitive user data, leading to potential privacy breaches and trust issues. Many clients are reluctant to file claims due to fears of their private information being compromised or mishandled. Furthermore, the process can be opaque, with a lack of accountability in how decisions are made regarding claims. This is where P2P Insurance FHE steps in, offering a solution rooted in privacy, transparency, and fairness.

## How FHE Addresses These Issues

By utilizing **Zama's open-source libraries**, including Concrete and the zama-fhe SDK, P2P Insurance FHE implements Fully Homomorphic Encryption to ensure that user data remains confidential throughout the entire claims process. With FHE, the data is encrypted in such a way that it can be processed without needing to decrypt it first. This means that even the jury, tasked with evaluating and deciding on claims, only sees the encrypted data, thereby protecting users’ privacy while enabling fair dispute resolution.

## Core Features

- **Encrypted Evidence Submissions:** Users can submit claims and related evidence that are securely encrypted, ensuring their sensitive information remains private.
- **Anonymous DAO Jury Voting:** Anonymity is preserved as a DAO constructs a jury to review claims, which votes on outcomes without knowing the identities of the claimants.
- **Privacy and Trust Enhancements:** Reduces the risks of data breaches or mismanagement, building user confidence in the insurance process.
- **Streamlined Claims Process:** Facilitates a more efficient and transparent claims adjudication process compared to traditional models.

## Technology Stack

- **Smart Contracts:** Solidity for contract implementation
- **Blockchain Platform:** Ethereum
- **Decentralized Autonomous Organization (DAO):** For jury compositions
- **Zama SDKs:**
  - **Concrete**
  - **TFHE-rs**
  - **zama-fhe SDK**
- **Development Tools:** Node.js, Hardhat or Foundry

## Directory Structure

Here is a structured view of the project’s directory:

```
P2P_Insurance_Fhe/
 ├── contracts/
 │   └── P2P_Insurance.sol
 ├── scripts/
 │   └── deploy.js
 ├── test/
 │   └── insurance.test.js
 ├── package.json
 └── README.md
```

## Getting Started

To set up the P2P Insurance FHE project on your local machine, follow these steps:

1. Ensure you have [Node.js](https://nodejs.org/) installed.
2. Install Hardhat or Foundry as per your preference for smart contract development.
3. Navigate to the project directory and run the following command to install dependencies:

   ```bash
   npm install
   ```

   This command will fetch the necessary Zama FHE libraries along with other project dependencies.

## Build and Run

After you have completed the installation, you can compile the smart contracts, run tests, and deploy your project by executing the following commands.

### Compile Contracts

```bash
npx hardhat compile
```

### Run Tests

To ensure that all functionalities work as expected, execute:

```bash
npx hardhat test
```

### Deploy to Local Network

To deploy on a local Ethereum network, run:

```bash
npx hardhat run scripts/deploy.js --network localhost
```

This will execute the deployment script, setting up your insurance protocol on the local blockchain.

## Example Code Snippet

Below is a simple example that demonstrates how a user can submit an encrypted claim for processing:

```javascript
const { P2PInsurance } = require("./P2P_Insurance.sol");

// Example function to submit an encrypted claim
async function submitClaim(userAddress, encryptedEvidence) {
    const insuranceContract = await P2PInsurance.deployed();
    const tx = await insuranceContract.submitClaim(userAddress, encryptedEvidence);
    console.log(`Claim submitted with transaction hash: ${tx.transactionHash}`);
}

// Usage
const userAddress = "0xYourEthereumAddress";
const encryptedEvidence = "EncryptedDataHere"; // FHE encrypted evidence
submitClaim(userAddress, encryptedEvidence);
```

## Acknowledgements

This project is **Powered by Zama**. We extend our heartfelt thanks to the Zama team for their pioneering innovations in Fully Homomorphic Encryption and their open-source tools that empower the development of secure and confidential blockchain applications. Your work enables the creation of solutions like P2P Insurance FHE, fostering a safer environment for managing sensitive user data.

---

With P2P Insurance FHE, we aim not only to redefine how insurance claims are processed but also to inspire greater trust and privacy in decentralized finance.
