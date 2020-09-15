// Public Wave API URL - Shouldn't need to change
var WAVE_API_URL = "https://gql.waveapps.com/graphql/public"

// URL to google sheet with three sheets inside: quotes, bookings, settings
var SHEETS_URL = "https://docs.google.com/spreadsheets/d/1QPuZbKhE-P-gLfCJOYqsFGe_AvOji2v8oqKeu0MOqS8/edit"
// The settings sheet should have two columns, representing key-value pairs with the following keys:
// BIZ_ID, RENT_ID, CLEANER_FEE_ID, CUSTOMER_DISCOUNT_ID, API_TOKEN, CLEANING_FEE, NIGHTLY_RATE, CUSTOMER_DISCOUNT
// CHECKIN_TIME, CHECKOUT_TIME, MAIL_FROM, PROPERTY_NAME, WELCOME_GUIDE_URL, RENTAL_AGREEMENT_URL, EMAIL_SIGNATURE

var settings = getSheetSettings()

function callWaveApi(query, variables) {
  var options = {
    method: "POST",
    headers: {
      Authorization: "Bearer " + settings.API_TOKEN
    },
    contentType: 'application/json',
    payload: JSON.stringify({
      query: query,
      variables: variables
    }),
    muteHttpExceptions: true
  }
  return JSON.parse(UrlFetchApp.fetch(WAVE_API_URL, options).getContentText())
}
 
function getWaveProducts() {
  const query = `query ($businessId: ID!) {
    business(id: $businessId) {
      products {
        edges {
          node {id name}
        }
      }}}`
  const variables = {
    "businessId": settings.BIZ_ID
  }
  var response = callWaveApi(query, variables)
  return response.data.business.products.edges
}
 
function getWaveCustomers() {
  const query = `query {business(id: "${settings.BIZ_ID}") {customers(page: 1, pageSize: 20, sort: [NAME_ASC]) {edges { node {id name phone email} } } } }`
  const variables = {}
  var response = callWaveApi(query, variables)
  return response.data.business.customers.edges
}

function getWaveCustomer(email) {
  const query = `query ($email: String) { 
    business(id: "${settings.BIZ_ID}") {
      customers(email: $email) {
        edges {
          node {id name phone email}
        }}}}`
  const variables = {"email": email}
  var response = callWaveApi(query, variables)
  if (response.data.business.customers.edges.length) {
    return response.data.business.customers.edges[0].node
  }
  return {}
}

function getWaveCustomerPaidInvoiceCount(customer) {
  const query = `query ($businessId: ID!, $customerId: ID!) {
    business(id: $businessId) {
      invoices(customerId: $customerId, status: PAID) {edges {
        node {id status}
      }}}}`
  const variables = {
    "businessId": settings.BIZ_ID,
    "customerId": customer.id
  }
  var response = callWaveApi(query, variables)    
  return response.data.business.invoices.edges.length
}

function createWaveCustomer(customerData) {
  const query = `mutation ($input: CustomerCreateInput!) {
    customerCreate(input: $input) {
      didSucceed
      customer {
        id
      }}}`
  const variables = {
    "input": {
      "businessId": settings.BIZ_ID,
      "name": customerData.name,
      "email": customerData.email,
      "phone": customerData.phone
    }
  }
  var response = callWaveApi(query, variables)    
  return response.data.customerCreate.customer
}

function createWaveInvoice(input, quote, customer) {
  const query = `mutation ($input: InvoiceCreateInput!) {
    invoiceCreate(input: $input) {
      didSucceed
      invoice {
        id
        viewUrl
        pdfUrl
        status
        title
        total {
          value
        }
      }}}`
  const variables = {
    "input": {
      "businessId": settings.BIZ_ID,
      "customerId": customer.id,
      "items": [{
        "productId": settings.RENT_ID,
        "unitPrice": quote.rent,
        "description": `${input.checkin} to ${input.checkout}`
      },{
        "productId": settings.CLEANER_FEE_ID,
        "unitPrice": quote.cleaning_fee
      },{
        "productId": settings.CUSTOMER_DISCOUNT_ID,
        "unitPrice": -Number(quote.customer_discount)
      }
    ],
    "status":"SAVED"
    }
  }
  var response = callWaveApi(query, variables)    
  return response.data.invoiceCreate.invoice
}

function markWaveInvoiceSent(invoice) {
  const query = `mutation ($input: InvoiceMarkSentInput!) {
    invoiceMarkSent(input: $input) {
      didSucceed
    }}`
  const variables = {
    "input": {
      "invoiceId": invoice.id,
      "sendMethod": "SHARED_LINK"
    }
  }
  var response = callWaveApi(query, variables)    
  return response.data.invoiceMarkSent.didSucceed
}

function waveInvoiceIsPaid(invoice) {
  const query = `query ($businessId: ID!, $invoiceId: ID!) {
    business(id: $businessId) {
      invoice(id: $invoiceId) {
        id,
        status
      }
    }}`
  const variables = {
    "businessId": settings.BIZ_ID,
    "invoiceId": invoice.id
  }
  var response = callWaveApi(query, variables)    
  return response.data.business.invoice.status === "VIEWED" // XXX - PAID
}

function addSheetQuote(quote) {
  var ss = SpreadsheetApp.openByUrl(SHEETS_URL)
  var sheet = ss.getSheetByName('quotes')
  sheet.appendRow([quote.input.name, quote.input.email, quote.input.phone, quote.input.adults, 
                   quote.input.kids, quote.input.checkin, quote.input.checkout, quote.quote.nights,
                   quote.quote.rent, quote.quote.customer_discount, quote.quote.tax, quote.quote.cleaning_fee, 
                   quote.quote.total, new Date(), quote.quote.customer])
}

function addSheetBooking(booking) {
  var ss = SpreadsheetApp.openByUrl(SHEETS_URL)
  var sheet = ss.getSheetByName('bookings')
  sheet.appendRow([booking.input.name, booking.input.email, booking.input.phone, booking.input.adults, 
                   booking.input.kids, booking.input.checkin, booking.input.checkout, booking.quote.nights,
                   booking.quote.rent, booking.quote.customer_discount, booking.quote.tax, booking.quote.cleaning_fee,
                   booking.quote.total, new Date(), booking.invoice])
                   
}

function getSheetSettings() {
  var ss = SpreadsheetApp.openByUrl(SHEETS_URL)
  var sheet = ss.getSheetByName('settings')
  var data = sheet.getDataRange().getValues();
  var ret = {}
  for (var i = 0; i < data.length; i++) {
    ret[data[i][0]] = data[i][1]
  }
  ret.lastUpdated = new Date()
  console.info(ret)
  return ret
}
  
function send_email(to, subject, txt, htm) {
  var retval = false
  if (!to) {
    console.warn(`send_email called with empty TO`)
    return retval
  }
  var options = {}
  if (settings.MAIL_FROM) {
    options.from = settings.MAIL_FROM
  }
  if (htm) {
    options.htmlBody = htm
  }
  GmailApp.sendEmail(to, subject, txt, options)
  console.info(`Sent mail to ${to}: ${subject}`)
  retval = true
  
  return retval
}
