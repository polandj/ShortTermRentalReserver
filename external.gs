// Public Wave API URL - SHouldn't need to change
var WAVE_API_URL = "https://gql.waveapps.com/graphql/public"

// URL to google sheet with three sheets inside: quotes, bookings, settings
// The settings sheet should have two columns, representing key-value pairs with the following keys:
// BIZ_ID, RENT_ID, CLEANER_FEE_ID, CUSTOMER_DISCOUNT_ID, API_TOKEN, CLEANING_FEE, NIGHTLY_RATE, CUSTOMER_DISCOUNT
var SHEETS_URL = "https://docs.google.com/spreadsheets/d/1QPuZbKhE-P-gLfCJOYqsFGe_AvOji2v8oqKeu0MOqS8/edit"

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

 /*
  query ($businessId: ID!, $customerId: ID!) {
  business(id: $businessId) {
    invoices(customerId: $customerId, status: PAID) {
      edges {
        node {
          id,
          status
        }
      }
    }
  }
}

{
    "businessId": "QnVzaW5lc3M6NjBmNGY0YmMtN2RjMC00YTIzLTk4ZjktZGEwN2JlMjQ1NDU5",
    "customerId": "QnVzaW5lc3M6NjBmNGY0YmMtN2RjMC00YTIzLTk4ZjktZGEwN2JlMjQ1NDU5O0N1c3RvbWVyOjQyMTk1NzIx"
  }
  */
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

/*
  mutation ($input: CustomerCreateInput!) {
  customerCreate(input: $input) {
    didSucceed
    inputErrors {
      message
      code
      path
    }
    customer {
      id
    }
  }
}

{
  "input": {
    "businessId": "QnVzaW5lc3M6NjBmNGY0YmMtN2RjMC00YTIzLTk4ZjktZGEwN2JlMjQ1NDU5",
    "name": "Sample Customer",
    "email": "foo@bar.com"
  }
}
*/
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

/* mutation ($input: InvoiceCreateInput!) {
  invoiceCreate(input: $input) {
    didSucceed
    invoice {
      id
      viewUrl
      status
      title
      total {
        value
      }
    }
  }
}*/
  /*
  {
  "input": {
    "businessId": "QnVzaW5lc3M6NjBmNGY0YmMtN2RjMC00YTIzLTk4ZjktZGEwN2JlMjQ1NDU5",
    "customerId": "QnVzaW5lc3M6NjBmNGY0YmMtN2RjMC00YTIzLTk4ZjktZGEwN2JlMjQ1NDU5O0N1c3RvbWVyOjQyMTk1NzIx",
    "items": [
      {
        "productId": "QnVzaW5lc3M6NjBmNGY0YmMtN2RjMC00YTIzLTk4ZjktZGEwN2JlMjQ1NDU5O1Byb2R1Y3Q6MzcwODM4ODg=",
        "unitPrice": "3500",
        "description": "Aug 3 - 10, 2020"
      },
      {
        "productId": "QnVzaW5lc3M6NjBmNGY0YmMtN2RjMC00YTIzLTk4ZjktZGEwN2JlMjQ1NDU5O1Byb2R1Y3Q6MzcwODM4ODk=",
        "unitPrice": "250"
      }
    ],
    "status":"SAVED"
    }
  }*/
function createWaveInvoice(input, quote, customer) {
  const query = `mutation ($input: InvoiceCreateInput!) {
    invoiceCreate(input: $input) {
      didSucceed
      invoice {
        id
        viewUrl
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


// https://developer.waveapps.com/hc/en-us/articles/360019968212-API-Reference#invoicemarksentinput 
  /*
  mutation ($input: InvoiceMarkSentInput!) {
  invoiceMarkSent(input: $input) {
    didSucceed
  }
}
{
  "input": {
    "invoiceId": "QnVzaW5lc3M6NjBmNGY0YmMtN2RjMC00YTIzLTk4ZjktZGEwN2JlMjQ1NDU5O0ludm9pY2U6OTkyMzM3NzAyNTcxNjAxOTk0",
    "sendMethod": "SHARED_LINK"
  }
}
*/
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

/*
 query ($businessId: ID!, $invoiceId: ID!) {
  business(id: $businessId) {
    invoice(id: $invoiceId) {
      id,
      status
    }
  }
}
{"businessId": "QnVzaW5lc3M6NjBmNGY0YmMtN2RjMC00YTIzLTk4ZjktZGEwN2JlMjQ1NDU5",
"invoiceId": "QnVzaW5lc3M6NjBmNGY0YmMtN2RjMC00YTIzLTk4ZjktZGEwN2JlMjQ1NDU5O0ludm9pY2U6OTkyMzM3NzAyNTcxNjAxOTk0"}
*/
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
  return response.data.business.invoice.status === "PAID"
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
                   booking.quote.rent, booking.quote.customer_discount, booking.qoute.tax, booking.quote.cleaning_fee,
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
  
