import React, {
  ReactElement,
  useState,
  ChangeEvent,
  useEffect,
  useRef
} from 'react'
import styles from './index.module.css'
import Header from '../Header'
import { toast } from 'react-toastify'
import Actions from '../Actions'
import { LoggerInstance, Pool, calcMaxExactOut } from '@oceanprotocol/lib'
import Token from '../Token'
import FormHelp from '@shared/FormInput/Help'
import Button from '@shared/atoms/Button'
import debounce from 'lodash.debounce'
import UserLiquidity from '../../UserLiquidity'
import InputElement from '@shared/FormInput/InputElement'
import { useWeb3 } from '@context/Web3'
import Decimal from 'decimal.js'
import { useAsset } from '@context/Asset'
import content from '../../../../../../content/price.json'
import { usePool } from '@context/Pool'

const slippagePresets = ['5', '10', '15', '25', '50']

export default function Remove({
  setShowRemove,
  poolAddress,
  poolTokens,
  totalPoolTokens,
  tokenOutAddress,
  tokenOutSymbol
}: {
  setShowRemove: (show: boolean) => void
  poolAddress: string
  poolTokens: string
  totalPoolTokens: string
  tokenOutAddress: string
  tokenOutSymbol: string
}): ReactElement {
  const { accountId, web3 } = useWeb3()
  const { isAssetNetwork } = useAsset()
  const { fetchAllData } = usePool()

  const [amountPercent, setAmountPercent] = useState('0')
  const [amountMaxPercent, setAmountMaxPercent] = useState('100')
  const [amountPoolShares, setAmountPoolShares] = useState('0')
  const [amountOcean, setAmountOcean] = useState('0')
  const [isLoading, setIsLoading] = useState<boolean>()
  const [txId, setTxId] = useState<string>()
  const [slippage, setSlippage] = useState<string>('5')
  const [minOceanAmount, setMinOceanAmount] = useState<string>('0')

  // TODO: precision needs to be set based on baseToken decimals
  Decimal.set({ toExpNeg: -18, precision: 18, rounding: 1 })
  const poolInstance = new Pool(web3)

  async function handleRemoveLiquidity() {
    setIsLoading(true)

    try {
      const result = await poolInstance.exitswapPoolAmountIn(
        accountId,
        poolAddress,
        amountPoolShares,
        minOceanAmount
      )
      setTxId(result?.transactionHash)
      // fetch new data
      fetchAllData()
    } catch (error) {
      LoggerInstance.error(error.message)
      toast.error(error.message)
    } finally {
      // reset slider after transaction
      setAmountPercent('0')
      setAmountOcean('0')
      setMinOceanAmount('0')
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!accountId || !poolTokens) return

    async function getMax() {
      const poolTokensAmount =
        !poolTokens || poolTokens === '0' ? '1' : poolTokens
      const maxTokensToRemoveFromPool = calcMaxExactOut(totalPoolTokens)
      const poolTokensDecimal = new Decimal(poolTokensAmount)
      const maxTokensToRemoveForUser = maxTokensToRemoveFromPool.greaterThan(
        poolTokensDecimal
      )
        ? poolTokensDecimal
        : maxTokensToRemoveFromPool

      const maxPercent = new Decimal(100)
        .mul(maxTokensToRemoveForUser)
        .div(poolTokensDecimal)
      setAmountMaxPercent(
        maxPercent.toDecimalPlaces(0, Decimal.ROUND_DOWN).toString()
      )
    }
    getMax()
  }, [accountId, poolAddress, poolTokens, totalPoolTokens])

  const getValues = useRef(
    debounce(async (newAmountPoolShares) => {
      const newAmountOcean = await poolInstance.calcSingleOutGivenPoolIn(
        poolAddress,
        tokenOutAddress,
        newAmountPoolShares
      )

      setAmountOcean(newAmountOcean)
    }, 150)
  )

  // Check and set outputs when amountPoolShares changes
  useEffect(() => {
    if (!accountId || !poolTokens) return
    getValues.current(amountPoolShares)
  }, [amountPoolShares, accountId, poolTokens, poolAddress, totalPoolTokens])

  useEffect(() => {
    if (!amountOcean || amountPercent === '0') {
      setMinOceanAmount('0')
      return
    }

    const minOceanAmount = new Decimal(amountOcean)
      .mul(new Decimal(100).minus(new Decimal(slippage)))
      .dividedBy(100)
      .toString()

    setMinOceanAmount(minOceanAmount.slice(0, 18))
  }, [slippage, amountOcean])

  // Set amountPoolShares based on set slider value
  function handleAmountPercentChange(e: ChangeEvent<HTMLInputElement>) {
    setAmountPercent(e.target.value)
    if (!poolTokens) return

    const amountPoolShares = new Decimal(e.target.value)
      .dividedBy(100)
      .mul(new Decimal(poolTokens))
      .toString()

    setAmountPoolShares(`${amountPoolShares.slice(0, 18)}`)
  }

  function handleMaxButton(e: ChangeEvent<HTMLInputElement>) {
    e.preventDefault()
    setAmountPercent(amountMaxPercent)

    const amountPoolShares = new Decimal(amountMaxPercent)
      .dividedBy(100)
      .mul(new Decimal(poolTokens))
      .toString()

    setAmountPoolShares(`${amountPoolShares.slice(0, 18)}`)
  }

  function handleSlippageChange(e: ChangeEvent<HTMLSelectElement>) {
    setSlippage(e.target.value)
  }

  return (
    <div className={styles.remove}>
      <Header
        title={content.pool.remove.title}
        backAction={() => {
          setShowRemove(false)
          fetchAllData()
        }}
      />

      <form className={styles.removeInput}>
        <UserLiquidity amount={poolTokens} symbol="pool shares" />
        <div className={styles.range}>
          <h3>{amountPercent}%</h3>
          <div className={styles.slider}>
            <input
              type="range"
              min="0"
              max={amountMaxPercent}
              disabled={!isAssetNetwork || isLoading}
              value={amountPercent}
              onChange={handleAmountPercentChange}
            />
            <Button
              style="text"
              size="small"
              className={styles.maximum}
              disabled={!isAssetNetwork || isLoading}
              onClick={handleMaxButton}
            >
              {`${amountMaxPercent}% max`}
            </Button>
          </div>

          <FormHelp>{content.pool.remove.simple}</FormHelp>
        </div>
      </form>
      <div className={styles.output}>
        <div>
          <p>{content.pool.remove.output.titleOut} minimum</p>
          <Token symbol={tokenOutSymbol} balance={minOceanAmount} />
        </div>
        {/* <div>
          <p>{content.pool.remove.output.titleIn}</p>
          <Token symbol="pool shares" balance={amountPoolShares} noIcon />
        </div> */}
      </div>
      <div className={styles.slippage}>
        <strong>Slippage Tolerance</strong>
        <InputElement
          name="slippage"
          type="select"
          size="mini"
          postfix="%"
          sortOptions={false}
          options={slippagePresets}
          disabled={!isAssetNetwork || isLoading}
          value={slippage}
          onChange={handleSlippageChange}
        />
      </div>
      <Actions
        isLoading={isLoading}
        loaderMessage="Removing Liquidity..."
        actionName={content.pool.remove.action}
        action={handleRemoveLiquidity}
        successMessage="Successfully removed liquidity."
        isDisabled={
          !isAssetNetwork ||
          amountPercent === '0' ||
          amountOcean === '0' ||
          poolTokens === '0'
        }
        txId={txId}
        tokenAddress={tokenOutAddress}
        tokenSymbol={tokenOutSymbol}
      />
    </div>
  )
}
