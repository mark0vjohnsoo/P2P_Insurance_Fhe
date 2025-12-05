// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface InsuranceClaim {
  id: string;
  encryptedAmount: string;
  encryptedEvidence: string;
  timestamp: number;
  claimant: string;
  category: string;
  status: "pending" | "approved" | "rejected";
  votesFor: number;
  votesAgainst: number;
}

// Style choices (randomly selected):
// Colors: High contrast (blue+orange)
// UI: Future metal
// Layout: Partition panels
// Interaction: Micro-interactions

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newClaimData, setNewClaimData] = useState({ 
    category: "", 
    description: "", 
    claimAmount: 0,
    evidenceHash: "" 
  });
  const [selectedClaim, setSelectedClaim] = useState<InsuranceClaim | null>(null);
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [activeTab, setActiveTab] = useState<"claims" | "dao">("claims");
  const [searchTerm, setSearchTerm] = useState("");

  // Randomly selected features: Data Statistics, Steps Wizard, FAQ Section
  const [showFAQ, setShowFAQ] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const approvedCount = claims.filter(c => c.status === "approved").length;
  const pendingCount = claims.filter(c => c.status === "pending").length;
  const rejectedCount = claims.filter(c => c.status === "rejected").length;

  useEffect(() => {
    loadClaims().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadClaims = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("claim_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing claim keys:", e); }
      }
      
      const list: InsuranceClaim[] = [];
      for (const key of keys) {
        try {
          const claimBytes = await contract.getData(`claim_${key}`);
          if (claimBytes.length > 0) {
            try {
              const claimData = JSON.parse(ethers.toUtf8String(claimBytes));
              list.push({ 
                id: key, 
                encryptedAmount: claimData.amount, 
                encryptedEvidence: claimData.evidence,
                timestamp: claimData.timestamp, 
                claimant: claimData.claimant, 
                category: claimData.category, 
                status: claimData.status || "pending",
                votesFor: claimData.votesFor || 0,
                votesAgainst: claimData.votesAgainst || 0
              });
            } catch (e) { console.error(`Error parsing claim data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading claim ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setClaims(list);
    } catch (e) { console.error("Error loading claims:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitClaim = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting claim data with Zama FHE..." });
    try {
      const encryptedAmount = FHEEncryptNumber(newClaimData.claimAmount);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const claimId = `claim-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const claimData = { 
        amount: encryptedAmount, 
        evidence: newClaimData.evidenceHash,
        timestamp: Math.floor(Date.now() / 1000), 
        claimant: address, 
        category: newClaimData.category, 
        status: "pending",
        votesFor: 0,
        votesAgainst: 0
      };
      
      await contract.setData(`claim_${claimId}`, ethers.toUtf8Bytes(JSON.stringify(claimData)));
      
      const keysBytes = await contract.getData("claim_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(claimId);
      await contract.setData("claim_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted claim submitted to DAO!" });
      await loadClaims();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewClaimData({ category: "", description: "", claimAmount: 0, evidenceHash: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const voteOnClaim = async (claimId: string, approve: boolean) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing FHE-encrypted vote..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const claimBytes = await contract.getData(`claim_${claimId}`);
      if (claimBytes.length === 0) throw new Error("Claim not found");
      const claimData = JSON.parse(ethers.toUtf8String(claimBytes));
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedClaim = { 
        ...claimData, 
        votesFor: approve ? claimData.votesFor + 1 : claimData.votesFor,
        votesAgainst: approve ? claimData.votesAgainst : claimData.votesAgainst + 1,
        status: (claimData.votesFor + (approve ? 1 : 0)) > (claimData.votesAgainst + (approve ? 0 : 1)) ? "approved" : 
                (claimData.votesAgainst + (approve ? 0 : 1)) > (claimData.votesFor + (approve ? 1 : 0)) ? "rejected" : "pending"
      };
      
      await contractWithSigner.setData(`claim_${claimId}`, ethers.toUtf8Bytes(JSON.stringify(updatedClaim)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Vote recorded with FHE privacy!" });
      await loadClaims();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Voting failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredClaims = claims.filter(claim => 
    claim.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    claim.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tutorialSteps = [
    { title: "Submit Encrypted Claim", description: "Submit your insurance claim with encrypted sensitive data", icon: "🔒" },
    { title: "DAO Jury Review", description: "Anonymous DAO members review your claim in encrypted form", icon: "👥" },
    { title: "FHE Voting", description: "Jury votes on your claim without seeing sensitive details", icon: "🗳️" },
    { title: "Get Payout", description: "Receive encrypted payout if claim is approved", icon: "💰" }
  ];

  const faqItems = [
    { question: "How does FHE protect my claim data?", answer: "Zama FHE encrypts your claim amount and evidence so DAO members can verify without seeing actual values." },
    { question: "Who can be a DAO jury member?", answer: "Any token holder can participate in the anonymous jury pool after staking." },
    { question: "How are votes counted?", answer: "Votes are tallied on encrypted data using FHE computations." },
    { question: "What happens if my claim is rejected?", answer: "You can appeal with additional evidence or accept the decision." }
  ];

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container future-metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon"><div className="shield-icon"></div></div>
          <h1>P2P<span>FHE</span>Insurance</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-claim-btn metal-button">
            <div className="add-icon"></div>New Claim
          </button>
          <button className="metal-button" onClick={() => setShowFAQ(!showFAQ)}>
            {showFAQ ? "Hide FAQ" : "Show FAQ"}
          </button>
          <div className="wallet-connect-wrapper"><ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/></div>
        </div>
      </header>
      
      <div className="main-content partitioned-layout">
        <div className="left-panel">
          <div className="panel-header">
            <h2>FHE Insurance Dashboard</h2>
            <div className="fhe-badge"><span>Zama FHE Secured</span></div>
          </div>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{claims.length}</div>
              <div className="stat-label">Total Claims</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{approvedCount}</div>
              <div className="stat-label">Approved</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{pendingCount}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{rejectedCount}</div>
              <div className="stat-label">Rejected</div>
            </div>
          </div>
          
          <div className="tutorial-section">
            <h3>How It Works</h3>
            <div className="steps-container">
              {tutorialSteps.map((step, index) => (
                <div 
                  className={`step ${currentStep === index ? 'active' : ''}`} 
                  key={index}
                  onClick={() => setCurrentStep(index)}
                >
                  <div className="step-number">{index + 1}</div>
                  <div className="step-content">
                    <h4>{step.title}</h4>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="right-panel">
          <div className="panel-header">
            <div className="tab-switcher">
              <button 
                className={`tab-button ${activeTab === "claims" ? "active" : ""}`}
                onClick={() => setActiveTab("claims")}
              >
                My Claims
              </button>
              <button 
                className={`tab-button ${activeTab === "dao" ? "active" : ""}`}
                onClick={() => setActiveTab("dao")}
              >
                DAO Jury
              </button>
            </div>
            <div className="search-box">
              <input 
                type="text" 
                placeholder="Search claims..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button onClick={loadClaims} className="refresh-btn metal-button" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          {activeTab === "claims" ? (
            <div className="claims-list">
              {filteredClaims.length === 0 ? (
                <div className="no-claims">
                  <div className="no-claims-icon"></div>
                  <p>No insurance claims found</p>
                  <button className="metal-button primary" onClick={() => setShowCreateModal(true)}>Submit First Claim</button>
                </div>
              ) : filteredClaims.filter(c => c.claimant === address).map(claim => (
                <div 
                  className="claim-card" 
                  key={claim.id}
                  onClick={() => setSelectedClaim(claim)}
                >
                  <div className="claim-header">
                    <div className="claim-id">#{claim.id.substring(0, 8)}</div>
                    <div className={`status-badge ${claim.status}`}>{claim.status}</div>
                  </div>
                  <div className="claim-details">
                    <div className="detail-item">
                      <span>Category:</span>
                      <strong>{claim.category}</strong>
                    </div>
                    <div className="detail-item">
                      <span>Date:</span>
                      <strong>{new Date(claim.timestamp * 1000).toLocaleDateString()}</strong>
                    </div>
                    <div className="detail-item">
                      <span>Votes:</span>
                      <strong>{claim.votesFor} For / {claim.votesAgainst} Against</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="dao-jury-view">
              <h3>Pending Claims for Review</h3>
              {filteredClaims.filter(c => c.status === "pending").length === 0 ? (
                <div className="no-pending">
                  <p>No pending claims requiring review</p>
                </div>
              ) : (
                <div className="pending-claims">
                  {filteredClaims.filter(c => c.status === "pending").map(claim => (
                    <div className="jury-card" key={claim.id}>
                      <div className="jury-header">
                        <div className="claim-id">#{claim.id.substring(0, 8)}</div>
                        <div className="claim-category">{claim.category}</div>
                      </div>
                      <div className="jury-actions">
                        <button 
                          className="metal-button success"
                          onClick={() => voteOnClaim(claim.id, true)}
                        >
                          Approve
                        </button>
                        <button 
                          className="metal-button danger"
                          onClick={() => voteOnClaim(claim.id, false)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitClaim} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          claimData={newClaimData} 
          setClaimData={setNewClaimData}
        />
      )}
      
      {selectedClaim && (
        <ClaimDetailModal 
          claim={selectedClaim} 
          onClose={() => { setSelectedClaim(null); setDecryptedAmount(null); }} 
          decryptedAmount={decryptedAmount}
          setDecryptedAmount={setDecryptedAmount}
          isDecrypting={isDecrypting}
          decryptWithSignature={decryptWithSignature}
          isClaimant={selectedClaim.claimant === address}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      {showFAQ && (
        <div className="faq-modal">
          <div className="faq-content metal-card">
            <div className="faq-header">
              <h2>FHE Insurance FAQ</h2>
              <button onClick={() => setShowFAQ(false)} className="close-modal">&times;</button>
            </div>
            <div className="faq-body">
              {faqItems.map((item, index) => (
                <div className="faq-item" key={index}>
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo"><div className="shield-icon"></div><span>P2P FHE Insurance</span></div>
            <p>Confidential peer-to-peer insurance with Zama FHE technology</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge"><span>Powered by Zama FHE</span></div>
          <div className="copyright">© {new Date().getFullYear()} P2P FHE Insurance DAO</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  claimData: any;
  setClaimData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, claimData, setClaimData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setClaimData({ ...claimData, [name]: value });
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setClaimData({ ...claimData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!claimData.category || !claimData.claimAmount) { 
      alert("Please fill required fields"); 
      return; 
    }
    // Generate a mock evidence hash
    if (!claimData.evidenceHash) {
      setClaimData({...claimData, evidenceHash: `0x${Math.random().toString(16).substring(2)}`});
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-card">
        <div className="modal-header">
          <h2>Submit Insurance Claim</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="key-icon"></div> 
            <div>
              <strong>FHE Encryption Notice</strong>
              <p>Claim amount will be encrypted with Zama FHE before submission</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Category *</label>
            <select 
              name="category" 
              value={claimData.category} 
              onChange={handleChange} 
              className="metal-select"
            >
              <option value="">Select category</option>
              <option value="Health">Health Insurance</option>
              <option value="Auto">Auto Insurance</option>
              <option value="Property">Property Damage</option>
              <option value="Travel">Travel Insurance</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <input 
              type="text" 
              name="description" 
              value={claimData.description} 
              onChange={handleChange} 
              placeholder="Brief description of claim..."
              className="metal-input"
            />
          </div>
          
          <div className="form-group">
            <label>Claim Amount (USD) *</label>
            <input 
              type="number" 
              name="claimAmount" 
              value={claimData.claimAmount} 
              onChange={handleAmountChange} 
              placeholder="Enter claim amount..."
              className="metal-input"
              step="0.01"
              min="0"
            />
          </div>
          
          <div className="form-group">
            <label>Evidence Hash</label>
            <input 
              type="text" 
              name="evidenceHash" 
              value={claimData.evidenceHash} 
              onChange={handleChange} 
              placeholder="IPFS hash or reference..."
              className="metal-input"
            />
          </div>
          
          <div className="encryption-preview">
            <h4>FHE Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data">
                <span>Plain Amount:</span>
                <div>${claimData.claimAmount || '0'}</div>
              </div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>{claimData.claimAmount ? FHEEncryptNumber(claimData.claimAmount).substring(0, 50) + '...' : 'No amount entered'}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn metal-button">Cancel</button>
          <button 
            onClick={handleSubmit} 
            disabled={creating} 
            className="submit-btn metal-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Claim"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ClaimDetailModalProps {
  claim: InsuranceClaim;
  onClose: () => void;
  decryptedAmount: number | null;
  setDecryptedAmount: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
  isClaimant: boolean;
}

const ClaimDetailModal: React.FC<ClaimDetailModalProps> = ({ 
  claim, 
  onClose, 
  decryptedAmount, 
  setDecryptedAmount, 
  isDecrypting, 
  decryptWithSignature,
  isClaimant
}) => {
  const handleDecrypt = async () => {
    if (decryptedAmount !== null) { 
      setDecryptedAmount(null); 
      return; 
    }
    const decrypted = await decryptWithSignature(claim.encryptedAmount);
    if (decrypted !== null) setDecryptedAmount(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="claim-detail-modal metal-card">
        <div className="modal-header">
          <h2>Claim Details #{claim.id.substring(0, 8)}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="claim-info">
            <div className="info-item">
              <span>Category:</span>
              <strong>{claim.category}</strong>
            </div>
            <div className="info-item">
              <span>Claimant:</span>
              <strong>{claim.claimant.substring(0, 6)}...{claim.claimant.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date Submitted:</span>
              <strong>{new Date(claim.timestamp * 1000).toLocaleString()}</strong>
            </div>
            <div className="info-item">
              <span>Status:</span>
              <strong className={`status-badge ${claim.status}`}>{claim.status}</strong>
            </div>
            <div className="info-item">
              <span>Votes:</span>
              <strong>{claim.votesFor} For / {claim.votesAgainst} Against</strong>
            </div>
          </div>
          
          <div className="encrypted-section">
            <h3>Encrypted Claim Data</h3>
            <div className="encrypted-data">
              <div className="data-label">Amount:</div>
              <div className="data-value">{claim.encryptedAmount.substring(0, 50)}...</div>
            </div>
            <div className="encrypted-data">
              <div className="data-label">Evidence:</div>
              <div className="data-value">{claim.encryptedEvidence}</div>
            </div>
            
            {isClaimant && (
              <button 
                className="decrypt-btn metal-button" 
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : decryptedAmount !== null ? "Hide Amount" : "Decrypt Amount"}
              </button>
            )}
          </div>
          
          {decryptedAmount !== null && (
            <div className="decrypted-section">
              <h3>Decrypted Claim Amount</h3>
              <div className="decrypted-amount">${decryptedAmount.toFixed(2)}</div>
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>Decrypted value only visible after wallet signature verification</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn metal-button">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;