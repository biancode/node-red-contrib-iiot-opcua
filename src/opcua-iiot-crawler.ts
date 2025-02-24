/*
 The BSD 3-Clause License

 Copyright 2022 - DATATRONiQ GmbH (https://datatroniq.com)
 Copyright (c) 2018-2022 Klaus Landsdorf (http://node-red.plus/)
 Copyright 2015,2016 - Mika Karaila, Valmet Automation Inc. (node-red-contrib-opcua)
 All rights reserved.
 node-red-contrib-iiot-opcua
 */
'use strict'

import * as nodered from "node-red";
import {TodoTypeAny} from "./types/placeholders";
import {NodeMessageInFlow} from "@node-red/registry";
import {
  checkCrawlerItemIsNotToFilter,
  checkItemForUnsetState,
  checkSessionNotValid,
  deregisterToConnector,
  FAKTOR_SEC_TO_MSEC,
  registerToConnector,
  resetIiotNode,
  setNodeStatusTo
} from "./core/opcua-iiot-core";
import coreBrowser, {BrowserInputPayloadLike} from "./core/opcua-iiot-core-browser";
import {Node, NodeAPI, NodeDef, NodeMessage, NodeStatus} from "node-red";
import {NodeCrawlerClientSession} from "node-opcua-client-crawler/source/node_crawler_base";
import {InjectPayload} from "./opcua-iiot-inject";
import {DataValue} from "node-opcua";
import {CompressedBrowseResult} from "./core/opcua-iiot-core-response";
import {isArray} from "./types/assertion";

interface OPCUAIIoTCrawler extends nodered.Node {
  name: string
  justValue: TodoTypeAny
  singleResult: TodoTypeAny
  showStatusActivities: boolean
  showErrors: boolean
  activateUnsetFilter: TodoTypeAny
  activateFilters: TodoTypeAny
  negateFilter: TodoTypeAny
  filters: Filter[]
  delayPerMessage: number
  timeout: number
  connector: Node
}

interface OPCUAIIoTCrawlerDef extends nodered.NodeDef {
  name: string
  justValue: TodoTypeAny
  singleResult: TodoTypeAny
  showStatusActivities: boolean
  showErrors: boolean
  activateUnsetFilter: TodoTypeAny
  activateFilters: TodoTypeAny
  negateFilter: TodoTypeAny
  filters: Filter[]
  delayPerMessage: number
  timeout: number
  connector: string
}

type Filter = {
  name: string
  value: string
}

type CrawlerMessage = NodeMessageInFlow & {
  payload: CrawlerPayload
}

export interface CrawlerPayload extends Omit<InjectPayload, 'nodetype'> {
  crawlerResults: (CrawlerResult[] | Error)[] | CrawlerResult[]
  browseTopic?: string
  crawlerResultsCount?: number
  endpoint?: string
  session?: string
  nodetype?: 'crawl'
  resultsConverted?: string
  error?: string
  value: CrawlerResult[] | CompressedBrowseResult[]
}

export type CrawlerResult = {
  nodeId: string
  nodeClass: number
  typeDefinition: string
  browseName: {
    name: string
    namespaceIndex: number
  }
  displayName: {
    locale: string
    text: string
  }
  description: {
    locale?: string
    text?: string
  }
  dataType?: string
  dataValue?: DataValue
  valueRank?: number
  minimumSamplingInterval?: number
  accessLevel?: number
  userAccessLevel?: number
} & CrawlerParent

type CrawlerParent = {
  parent?: CrawlerResult
  referenceToParent?: CrawlerResult
}


/**
 * Crawler Node-RED nodeConfig.
 *
 * @param RED
 */
module.exports = (RED: nodered.NodeAPI) => {
  // SOURCE-MAP-REQUIRED

  function OPCUAIIoTCrawler(this: OPCUAIIoTCrawler & TodoTypeAny, config: OPCUAIIoTCrawlerDef) {
    RED.nodes.createNode(this, config)

    this.name = config.name
    this.justValue = config.justValue
    this.singleResult = config.singleResult
    this.showStatusActivities = config.showStatusActivities
    this.showErrors = config.showErrors
    this.activateUnsetFilter = config.activateUnsetFilter
    this.activateFilters = config.activateFilters
    this.negateFilter = config.negateFilter
    this.filters = config.filters
    this.delayPerMessage = config.delayPerMessage || 0.2
    this.timeout = config.timeout || 30

    this.connector = RED.nodes.getNode(config.connector)

    let self: TodoTypeAny = this;
    const {iiot, browseTopic} = coreBrowser.initBrowserNode();
    self.browseTopic = browseTopic;
    self.iiot = iiot;

    self.iiot.delayMessageTimer = []

    const filterCrawlerResults = function (crawlerResultToFilter: TodoTypeAny[]) {
      let crawlerResult = crawlerResultToFilter || []
      let filteredEntries: TodoTypeAny[] = []
      if (self.activateFilters && self.filters && self.filters.length > 0) {
        crawlerResult.forEach(function (item) {
          if (itemIsNotToFilter(item)) {
            filteredEntries.push(item)
          }
        })
        crawlerResult = filteredEntries
      }

      if (self.justValue) {
        crawlerResult.forEach(function (item) {
          if (item.references) {
            delete item['references']
          }
        })
      }

      return crawlerResult
    }

    const itemIsNotToFilter = function (item: TodoTypeAny) {
      let result = checkItemForUnsetState(self, item)

      if (result) {
        result = self.filters.every((element: TodoTypeAny) => {
          return checkCrawlerItemIsNotToFilter(self, item, element, result) !== 0
        }) ? 1 : 0
      }
      return (self.negateFilter) ? !result : result
    }

    const crawl = async (session: TodoTypeAny, payload: BrowserInputPayloadLike, statusHandler: (status: string | NodeStatus) => void) => {
      if (checkSessionNotValid(self.connector.iiot.opcuaSession, 'Crawler')) {
        return
      }

      coreBrowser.internalDebugLog('Browse Topic To Call Crawler ' + self.browseTopic)

      if (self.showStatusActivities && self.oldStatusParameter) {
        self.oldStatusParameter = setNodeStatusTo(self, 'crawling', self.oldStatusParameter, self.showStatusActivities, statusHandler)
      }
      coreBrowser.crawl(session, self.browseTopic, payload, getSendWrapper(payload))

    }

    const callError = (err: Error, msg: NodeMessageInFlow) => {
      this.error(err, msg)
    }
    const statusHandler = (status: string | NodeStatus) => {
      this.status(status)
    }

    const crawlForSingleResult = function (session: NodeCrawlerClientSession, payload: BrowserInputPayloadLike) {
      coreBrowser.crawlAddressSpaceItems(session, payload, getSendWrapper(payload), self.timeout)
    }

    type PromiseResult = {
      status: string,
      value: Error | TodoTypeAny
    }

    const handleResultArray = (results: PromiseResult[], payload: TodoTypeAny) => {
      // map each result 1-to-1 input to output
      const crawlerResult = results.map(function (result) {
        if (result.value instanceof Error) {
          return result.value.toString()
        } else {
          return filterCrawlerResults(result.value)
        }
      })

      // combine the valid results into payload.value
      const value = crawlerResult.filter((result) => {
        return !(typeof result === 'string')
      }).flatMap((result) => {
        return result
      })

      // list errors in payload.error
      const error = results.filter((result) => {
        return (result.value instanceof Error)
      }).map((result) => {
        return result.value
      })

      if (error.length > 0) {
        payload.error = error
      }
      payload.value = value

      sendMessage(payload, crawlerResult)
    }

    /**
     * Returns a sendWrapper function with the correct payload context
     */
    const getSendWrapper = (payload: BrowserInputPayloadLike) => {
      return (result: Error | TodoTypeAny) => {
        if (result.promises) {
          handleResultArray(result.crawlerResult, payload)
        } else if (result instanceof Error) {
          coreBrowser.browseErrorHandling(self, result, payload, undefined, callError, statusHandler, self.oldStatusParameter, self.showErrors, self.showStatusActivities)
        } else {
          coreBrowser.internalDebugLog(result.rootNodeId + ' Crawler Results ' + result.crawlerResult.length);
          const filteredResults = filterCrawlerResults(result.crawlerResult);
          (payload as TodoTypeAny).value = [filteredResults]
          sendMessage(payload as FlatMessage<CrawlerPayload>, filteredResults)
        }
      }
    }

    const crawlForResults = function (session: NodeCrawlerClientSession, payload: BrowserInputPayloadLike) {
      payload.addressSpaceItems?.forEach((entry) => {
        coreBrowser.crawl(session, entry.nodeId, payload, getSendWrapper(payload))
      })
    }

    const crawlNodeList = function (session: NodeCrawlerClientSession, payload: BrowserInputPayloadLike) {
      if (self.showStatusActivities && self.oldStatusParameter) {
        self.oldStatusParameter = setNodeStatusTo(self, 'crawling', self.oldStatusParameter, self.showStatusActivities, statusHandler)
      }
      if (self.singleResult) {
        crawlForSingleResult(session, payload)
      } else {
        crawlForResults(session, payload)
      }
    }

    interface FlatMessage<T extends object> extends CrawlerPayload {
      _msgid: string,
      topic: string,
    }

    const sendMessage = (payload: FlatMessage<CrawlerPayload>, crawlerResult: TodoTypeAny) => {
      const {
        _msgid,
        topic,
        ...restMessage
      } = payload;

      restMessage.nodetype = 'crawl'

      try {
        RED.util.setMessageProperty(restMessage, 'crawlerResults', JSON.parse(JSON.stringify(crawlerResult, null, 2)))
      } catch (err: any) {
        coreBrowser.internalDebugLog(err)
        if (self.showErrors) {
          this.error(err, restMessage)
        }
        restMessage.resultsConverted = JSON.stringify(crawlerResult, null, 2)
        restMessage.error = err.message
      }

      if (self.browseTopic && self.browseTopic !== '') {
        restMessage.browseTopic = self.browseTopic
      }
      if (restMessage.crawlerResults.length === 1 && isArray<CrawlerResult>(restMessage.crawlerResults[0])) {
        restMessage.crawlerResults = restMessage.crawlerResults[0]
      }

      if (!self.justValue) {
        restMessage.crawlerResultsCount = crawlerResult.length
        if (self.connector) {
          restMessage.endpoint = self.connector.endpoint
        }
        restMessage.session = self.connector.iiot.opcuaSession.name || 'none'
      }

      const msg = {
        _msgid,
        topic,
        payload: restMessage
      }

      self.iiot.messageList.push(msg)

      if (self.showStatusActivities && self.oldStatusParameter) {
        self.oldStatusParameter = setNodeStatusTo(self, 'active', self.oldStatusParameter, self.showStatusActivities, statusHandler)
      }

      // TODO: maybe here RED.util.set ...

      self.iiot.delayMessageTimer.push(setTimeout(() => {
        this.send(self.iiot.messageList.shift())
      }, self.delayPerMessage * FAKTOR_SEC_TO_MSEC))
    }

    const resetAllTimer = function () {
      self.iiot.delayMessageTimer.forEach((timerId: TodoTypeAny) => {
        clearTimeout(timerId)
        timerId = null
      })
    }

    const startCrawling = async (payload: BrowserInputPayloadLike) => {
      if(!self.connector) {
        return
      }

      if (self.connector.functions.hasNoSession()) {
        await self.connector.functions.startSession(self.id)
      }

      if (self.browseTopic && self.browseTopic !== '') {
        crawl(self.connector.iiot.opcuaSession, payload, statusHandler)

      } else {
        if (payload.addressSpaceItems && payload.addressSpaceItems.length) {
          coreBrowser.internalDebugLog('Start Crawling On AddressSpace Items')
          crawlNodeList(self.connector.iiot.opcuaSession, payload)
        } else {
          this.error(new Error('No AddressSpace Items Or Root To Crawl'), payload)
        }
      }
    }

    const errorHandler = (err: Error, msg: NodeMessage) => {
      this.error(err, msg)
    }

    const setStatus = (status: string | NodeStatus) => {
      this.status(status)
    }

    const emitHandler = (msg: string) => {
      this.emit(msg)
    }

    const onAlias = (event: string, callback: () => void) => {
      this.on(event, callback)
    }

    type enhancedPayload = BrowserInputPayloadLike & {
      _msgid: string
      topic: string | undefined
    }

    this.on('input', function (msg: NodeMessageInFlow) {
      const payload = msg.payload as enhancedPayload
      self.browseTopic = coreBrowser.extractNodeIdFromTopic(payload, self);
      payload._msgid = msg._msgid;
      payload.topic = msg.topic;
      startCrawling(msg.payload as BrowserInputPayloadLike).finally()
    })

    registerToConnector(this, setStatus, onAlias, errorHandler)

    this.on('close', (done: () => void) => {
      self.removeAllListeners()
      resetAllTimer()

      deregisterToConnector(this, () => {
        resetIiotNode(this)
        done()
      })
    })
  }

  RED.nodes.registerType('OPCUA-IIoT-Crawler', OPCUAIIoTCrawler)
}
