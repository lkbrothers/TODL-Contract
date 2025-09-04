require("@nomicfoundation/hardhat-toolbox");
require("@typechain/hardhat");
require('dotenv').config();

require("@nomicfoundation/hardhat-verify");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: false,
    },
  },
  typechain: {
    outDir: "types",        // 타입 생성 디렉토리
    target: "ethers-v6",    // 꼭 v6로 지정
  },
  mocha: {
    timeout: 40000
  },
  networks: {
    hardhat: {
      loggingEnabled: false
    },
    localhost: {
      url: process.env.PROVIDER_URL,
      accounts: [process.env.PRIVATE_KEY]
    },
    LKtestnet: {
      url: process.env.PROVIDER_URL,
      accounts: [process.env.PRIVATE_KEY]
    },
    StatusNetwork: {
      url: process.env.PROVIDER_URL,
      accounts: [process.env.PRIVATE_KEY]
    }
  },
  etherscan: {
    apiKey: {
      // Is not required by blockscout. Can be any non-empty string
      'StatusNetwork': "abc"
    },
    customChains: [
      {
        network: "StatusNetwork",
        chainId: 1660990954,
        urls: {
          apiURL: "https://sepoliascan.status.network/api",
          browserURL: "https://sepoliascan.status.network/",
        }
      }
    ]
  },
};
