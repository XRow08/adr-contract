import { BN, web3 } from '@project-serum/anchor';

export type AdrTokenMint = {
  "version": "0.1.0",
  "name": "adr_token_mint",
  "instructions": [
    {
      "name": "initializeCollection",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "collectionMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "collectionMetadata",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "collectionTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "config",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "nftCounter",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "mintNftWithPayment",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "nftCounter",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "nftMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "nftMetadata",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "nftTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "collectionMetadata",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "paymentTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "payerPaymentTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "config",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "stakeTokens",
      "accounts": [
        {
          "name": "staker",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "tokenMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "stakerTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "stakeAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "stakeTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "stakeAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "config",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "period",
          "type": {
            "defined": "StakingPeriod"
          }
        }
      ]
    },
    {
      "name": "unstakeTokens",
      "accounts": [
        {
          "name": "staker",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "tokenMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rewardTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "stakerTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "stakeTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "stakeAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "stakeAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "config",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "getStakeSummaryView",
      "accounts": [
        {
          "name": "staker",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "tokenMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "stakeAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "config",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "getConfigSummaryView",
      "accounts": [
        {
          "name": "config",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "getCollectionInfoView",
      "accounts": [
        {
          "name": "collectionMetadata",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "nftCounter",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "calculateEstimatedRewardView",
      "accounts": [
        {
          "name": "config",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "period",
          "type": {
            "defined": "StakingPeriod"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "nftCounter",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "count",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "configAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paymentTokenMint",
            "type": "publicKey"
          },
          {
            "name": "admin",
            "type": "publicKey"
          },
          {
            "name": "stakingEnabled",
            "type": "bool"
          },
          {
            "name": "stakingRewardRate",
            "type": "u64"
          },
          {
            "name": "maxStakeAmount",
            "type": "u64"
          },
          {
            "name": "emergencyPaused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "nftMetadata",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "publicKey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          },
          {
            "name": "collection",
            "type": {
              "option": "publicKey"
            }
          }
        ]
      }
    },
    {
      "name": "stakeAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "publicKey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "unlockTime",
            "type": "i64"
          },
          {
            "name": "period",
            "type": {
              "defined": "StakingPeriod"
            }
          },
          {
            "name": "claimed",
            "type": "bool"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "StakingSummary",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "isStaking",
            "type": "bool"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "unlockTime",
            "type": "i64"
          },
          {
            "name": "period",
            "type": {
              "defined": "StakingPeriod"
            }
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "canUnstake",
            "type": "bool"
          },
          {
            "name": "estimatedReward",
            "type": "u64"
          },
          {
            "name": "timeRemaining",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "ConfigSummary",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paymentTokenMint",
            "type": "publicKey"
          },
          {
            "name": "admin",
            "type": "publicKey"
          },
          {
            "name": "stakingEnabled",
            "type": "bool"
          },
          {
            "name": "stakingRewardRate",
            "type": "u64"
          },
          {
            "name": "maxStakeAmount",
            "type": "u64"
          },
          {
            "name": "emergencyPaused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "StakingPeriod",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Minutes1",
            "fields": []
          },
          {
            "name": "Minutes2",
            "fields": []
          },
          {
            "name": "Minutes5",
            "fields": []
          },
          {
            "name": "Minutes10",
            "fields": []
          },
          {
            "name": "Minutes30",
            "fields": []
          }
        ]
      }
    }
  ],
  "events": [
    {
      "name": "TokenBurnEvent",
      "fields": [
        {
          "name": "payer",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "tokenMint",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "amount",
          "type": "u64",
          "index": false
        },
        {
          "name": "nftMint",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "timestamp",
          "type": "i64",
          "index": false
        }
      ]
    },
    {
      "name": "StakingEvent",
      "fields": [
        {
          "name": "staker",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "amount",
          "type": "u64",
          "index": false
        },
        {
          "name": "period",
          "type": {
            "defined": "StakingPeriod"
          },
          "index": false
        },
        {
          "name": "startTime",
          "type": "i64",
          "index": false
        },
        {
          "name": "unlockTime",
          "type": "i64",
          "index": false
        },
        {
          "name": "stakeAccount",
          "type": "publicKey",
          "index": false
        }
      ]
    },
    {
      "name": "UnstakingEvent",
      "fields": [
        {
          "name": "staker",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "stakeAccount",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "originalAmount",
          "type": "u64",
          "index": false
        },
        {
          "name": "rewardAmount",
          "type": "u64",
          "index": false
        },
        {
          "name": "totalAmount",
          "type": "u64",
          "index": false
        },
        {
          "name": "timestamp",
          "type": "i64",
          "index": false
        }
      ]
    },
    {
      "name": "ConfigUpdateEvent",
      "fields": [
        {
          "name": "admin",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "field",
          "type": "string",
          "index": false
        },
        {
          "name": "oldValue",
          "type": "string",
          "index": false
        },
        {
          "name": "newValue",
          "type": "string",
          "index": false
        },
        {
          "name": "timestamp",
          "type": "i64",
          "index": false
        }
      ]
    },
    {
      "name": "EmergencyPauseEvent",
      "fields": [
        {
          "name": "admin",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "paused",
          "type": "bool",
          "index": false
        },
        {
          "name": "reason",
          "type": "string",
          "index": false
        },
        {
          "name": "timestamp",
          "type": "i64",
          "index": false
        }
      ]
    },
    {
      "name": "StakeUpdatedEvent",
      "fields": [
        {
          "name": "staker",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "oldAmount",
          "type": "u64",
          "index": false
        },
        {
          "name": "newAmount",
          "type": "u64",
          "index": false
        },
        {
          "name": "oldPeriod",
          "type": {
            "defined": "StakingPeriod"
          },
          "index": false
        },
        {
          "name": "newPeriod",
          "type": {
            "defined": "StakingPeriod"
          },
          "index": false
        },
        {
          "name": "startTime",
          "type": "i64",
          "index": false
        },
        {
          "name": "unlockTime",
          "type": "i64",
          "index": false
        },
        {
          "name": "timestamp",
          "type": "i64",
          "index": false
        }
      ]
    },
    {
      "name": "StakeAddedEvent",
      "fields": [
        {
          "name": "staker",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "additionalAmount",
          "type": "u64",
          "index": false
        },
        {
          "name": "totalAmount",
          "type": "u64",
          "index": false
        },
        {
          "name": "newUnlockTime",
          "type": "i64",
          "index": false
        },
        {
          "name": "timestamp",
          "type": "i64",
          "index": false
        }
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "Unauthorized",
      "msg": "Você não está autorizado a realizar esta ação"
    },
    {
      "code": 6001,
      "name": "InvalidPaymentToken",
      "msg": "Token de pagamento inválido"
    },
    {
      "code": 6002,
      "name": "InvalidPaymentAmount",
      "msg": "Valor de pagamento inválido"
    },
    {
      "code": 6003,
      "name": "PaymentTokenNotConfigured",
      "msg": "Token de pagamento não configurado"
    },
    {
      "code": 6004,
      "name": "StakingNotEnabled",
      "msg": "Staking não está habilitado"
    },
    {
      "code": 6005,
      "name": "InvalidStakeAmount",
      "msg": "Valor de stake inválido"
    },
    {
      "code": 6006,
      "name": "InsufficientFunds",
      "msg": "Fundos insuficientes"
    },
    {
      "code": 6007,
      "name": "StakingPeriodNotCompleted",
      "msg": "Período de staking não completado"
    },
    {
      "code": 6008,
      "name": "RewardsAlreadyClaimed",
      "msg": "Recompensas já foram reivindicadas"
    },
    {
      "code": 6009,
      "name": "PaymentNotApproved",
      "msg": "Pagamento não aprovado. Use approve_delegate primeiro"
    },
    {
      "code": 6010,
      "name": "SystemPaused",
      "msg": "O sistema está pausado para emergência"
    },
    {
      "code": 6011,
      "name": "InvalidInput",
      "msg": "Valor de entrada inválido"
    },
    {
      "code": 6012,
      "name": "MathOverflow",
      "msg": "Erro de overflow matemático"
    },
    {
      "code": 6013,
      "name": "StakeAmountTooLarge",
      "msg": "Valor de stake excede o limite máximo permitido"
    },
    {
      "code": 6014,
      "name": "StakeAlreadyClaimed",
      "msg": "Este stake já foi reivindicado"
    }
  ]
}; 