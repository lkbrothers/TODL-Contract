require("@nomicfoundation/hardhat-toolbox");
require("@typechain/hardhat");
require('dotenv').config();

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
    LKtestnet: {
      url: process.env.PROVIDER_URL,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
