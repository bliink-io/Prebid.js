// eslint-disable-next-line prebid/validate-imports
import * as utils from 'src/utils'
// eslint-disable-next-line prebid/validate-imports
import { registerBidder } from 'src/adapters/bidderFactory'

export const BIDDER_CODE = 'bliink'
export const BLIINK_ENDPOINT_ENGINE = 'https://engine.bliink.io/delivery'
export const BLIINK_ENDPOINT_COOKIE_SYNC = 'https://cookiesync.api.bliink.io'

const VIDEO = 'video'
const NATIVE = 'native'
const BANNER = 'banner'

const supportedMediaTypes = [BANNER, VIDEO, NATIVE]
const aliasBidderCode = ['bk']

/**
 * @param bidRequest
 * @param bliinkCreative
 * @param isNative
 * @param isVideo
 * @return {{cpm, netRevenue: boolean, ad: string, requestId, width: number, currency: string, mediaType: string, vastXml, ttl: number, creativeId, height: number}|null}
 */
export const buildBid = (bidRequest, bliinkCreative, isNative = false, isVideo = false) => {
  if (!bidRequest && !bliinkCreative) return null

  const body = {
    requestId: bidRequest.bidId,
    cpm: bliinkCreative.price,
    creativeId: bliinkCreative.id,
    currency: 'EUR',
    netRevenue: false,
    width: 1,
    height: 1,
    ttl: 3600,
  }

  if (isVideo) {
    return {
      ...body,
      mediaType: VIDEO,
      ad: '<html lang="en"></html>',
      vastXml: bliinkCreative.content,
    }
  }

  // eslint-disable-next-line no-mixed-operators
  if ((!isNative && bliinkCreative) && bidRequest && bliinkCreative &&
    // eslint-disable-next-line no-mixed-operators
    !bidRequest.bidId ||
    !bidRequest.sizes ||
    !bliinkCreative.content ||
    (!bliinkCreative.id || bliinkCreative.id.length === 0) ||
    !bliinkCreative.adm ||
    !bidRequest.params ||
    !(bidRequest.params.placement)
  ) return null

  delete bidRequest['bids']
  return {
    ...body,
    ad: bliinkCreative.adm,
  };
}

/**
 * @description Verify the the AdUnits.bids, respond with true (valid) or false (invalid).
 *
 * @param bid
 * @return boolean
 */
export const isBidRequestValid = (bid) => {
  return !(!bid || !bid.params || !bid.params.placement || !bid.params.tagId)
}

/**
 * @description Takes an array of valid bid requests, all of which are guaranteed to have passed the isBidRequestValid() test.
 *
 * @param _[]
 * @param bidderRequest
 * @return {{ method: string, url: string } | null}
 */
export const buildRequests = (_, bidderRequest) => {
  if (!bidderRequest) return null

  let data = {
    test: true,
  }

  const params = {
    bidderRequestId: bidderRequest.bidderRequestId,
    bidderCode: bidderRequest.bidderCode,
    bids: bidderRequest.bids,
    refererInfo: bidderRequest.refererInfo,
  }

  if (bidderRequest.gdprConsent && bidderRequest.gdprConsent) {
    data = {
      ...data,
      gdpr: bidderRequest.gdprConsent && bidderRequest.gdprConsent.gdprApplies,
      gdpr_consent: bidderRequest.gdprConsent.consentString
    }
  }

  if (bidderRequest.bids[0].sizes && bidderRequest.bids[0].sizes[0]) {
    data = {
      ...data,
      width: bidderRequest.bids[0].sizes[0][0],
      height: bidderRequest.bids[0].sizes[0][1]
    }
  }

  return {
    method: 'GET',
    url: `${BLIINK_ENDPOINT_ENGINE}/${bidderRequest.bids[0].params.tagId}`,
    data: data,
    params: params,
  }
}

/**
 * @description Parse the response (from buildRequests) and generate one or more bid objects.
 *
 * @param serverResponse
 * @param request
 * @return
 */
const interpretResponse = (serverResponse, request) => {
  if (serverResponse && serverResponse.mode === 'no-ad') {
    return []
  }

  const body = serverResponse.body
  const serverBody = request.params;

  if (body && body.mode === 'rtb') {
    return utils._map(serverBody.bids, (bid) => {
      const creative = {
        content: body.ad[body.ad.media_type].content,
        price: body.price || 0,
        id: '',
        media_type: body.ad.media_type,
      }

      return buildBid(bid, creative, body.ad.media_type === NATIVE, body.ad.media_type === VIDEO);
    })
  }

  if (serverBody && serverBody.bids && utils.isArray(serverBody.bids)) {
    return utils._map(serverBody.bids, (bid) => {
      return buildBid(bid, serverResponse.body.creative);
    })
  }

  return []
}

/**
 * @description  If the publisher allows user-sync activity, the platform will call this function and the adapter may register pixels and/or iframe user syncs. For more information, see Registering User Syncs below
 * @param syncOptions
 * @param serverResponses
 * @param gdprConsent
 * @return {[{type: string, url: string}]|*[]}
 */
const getUserSyncs = (syncOptions, serverResponses, gdprConsent) => {
  let syncs = []
  let gdprParams = ''
  if (gdprConsent) {
    if (typeof gdprConsent.gdprApplies === 'boolean') {
      gdprParams = `hasConsent=${Number(gdprConsent.gdprApplies)}&consentString=${gdprConsent.consentString}`
    } else {
      gdprParams = `consentString=${gdprConsent.consentString}`
    }
  }

  if (syncOptions.iframeEnabled) {
    syncs.push({
      type: 'iframe',
      url: '//acdn.adnxs.com/ib/static/usersync/v3/async_usersync.html?' + gdprParams
    })
  }
  if (syncOptions.pixelEnabled && serverResponses.length > 0) {
    const UrlBliink = [
      `${BLIINK_ENDPOINT_COOKIE_SYNC}/cookiesync?partner=smart&uid=[sas_uid]`,
      `${BLIINK_ENDPOINT_COOKIE_SYNC}/cookiesync?partner=azerion&uid={PUB_USER_ID}`,
      `${BLIINK_ENDPOINT_COOKIE_SYNC}/cookiesync?partner=appnexus&uid=$UID`,
      `https://ad.360yield.com/server_match?partner_id=1531&r=${BLIINK_ENDPOINT_COOKIE_SYNC}/cookiesync?partner=azerion&uid={PUB_USER_ID}}`,
      `https://ads.stickyadstv.com/auto-user-sync`,
      `https://cookiesync.api.bliink.io/getuid?url=https%3A%2F%2Fvisitor.omnitagjs.com%2Fvisitor%2Fsync%3Fuid%3D1625272249969090bb9d544bd6d8d645%26name%3DBLIINK%26visitor%3D%24UID%26external%3Dtrue`,
      `https://pixel.advertising.com/ups/58444/sync?&gdpr=1&gdpr_consent=${gdprConsent.consentString}&redir=true&uid=sampleUserId`,
      `https://ups.analytics.yahoo.com/ups/58499/occ?gdpr=1&gdpr_consent=${gdprConsent.consentString}`,
      `https://secure.adnxs.com/getuid?${BLIINK_ENDPOINT_COOKIE_SYNC}/cookiesync?partner=appnexus&uid=$UID}`
    ]

    UrlBliink.forEach(item => {
      syncs = [
        ...syncs,
        {
          type: 'image',
          url: item + `&${gdprParams}`,
        },
      ]
    })

    return syncs
  }

  return syncs;
}

/**
 * @description If the adapter timed out for an auction, the platform will call this function and the adapter may register timeout. For more information, see Registering User Syncs below.
 *
 * @return void
 */
const onTimeout = () => {}

/**
 * @param bid
 * @return bid
 */
const onBidWon = (bid) => {
  return bid
}

/**
 * @type {{interpretResponse: interpretResponse, code: string, aliases: string[], getUserSyncs: getUserSyncs, buildRequests: buildRequests, onTimeout: onTimeout, onSetTargeting: onSetTargeting, isBidRequestValid: isBidRequestValid, onBidWon: onBidWon}}
 */
export const spec = {
  code: BIDDER_CODE,
  aliases: aliasBidderCode,
  supportedMediaTypes: supportedMediaTypes,
  isBidRequestValid,
  buildRequests,
  interpretResponse,
  getUserSyncs,
  onTimeout,
  onBidWon,
}

registerBidder(spec)
