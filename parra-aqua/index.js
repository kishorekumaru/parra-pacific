const axios = require('axios')
const twilio = require('twilio');

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html 
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 * 
 */
module.exports.handler = async (event, context) => {

    const url = 'https://thepac.perfectgym.com.au/ClientPortal2/Groups/GroupsCalendar/GroupList';
    const payload = {
            "filterParams": {
            "clubId": 1,
            "vacancies": 1,
            "ageLimitId": 5,
            "activityCategoryIds": [3],
            "activityUserLevelIds": [17],
            "daysOfWeek": [],
            "semesterIds": [],
            "showSingleLesson": null,
            "date": null
        },
        "query": {
        "pageSize": 20,
        "pageNumber": 1
        }
    };

    // Function to make a GET request using Axios
    const fetchData = async (url, headers) => {
        try {
        const response = await axios.get(url, headers);
        return { url, data: response.data, error: null };
        } catch (error) {
        return { url, data: null, error: error.message };
        }
    };

    try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const client = twilio(accountSid, authToken);

        const bookingURL = 'https://thepac.perfectgym.com.au/ClientPortal2/Groups/GroupDetailsModal/Details?groupId=';
        const cookies = process.env.COOKIE;

       const ret = await axios.post(url, payload, { 
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
       });
       const { Data } = ret.data;
       const filteredData = Data.filter(item => item.Status === 'Bookable')
        .map(item => ({
            name: item.Name,
            left: item.BookingIndicator.Available,
            id: item.Id,
            trainer: item.Trainer
        }))
        .filter(item => item.name.includes('Friday') || item.name.includes('Saturday') || item.name.includes('Sunday'))
        .map(item => ({msg:`On ${item.name.replace(/Jellyfish/g, '')} - ${item.left} available - ${item.trainer}`, id: item.id}));


        
        const results = await Promise.allSettled(filteredData.map(data => fetchData(`${bookingURL}${data.id}`, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Cookie': cookies
            }
        })));

       const msg =  results.map(result => {
            if ( results.value?.data?.Users[0].Status === 'Bookable') {
                return `On ${result.value.data.Name } - Trainer: ${result.value.data.Trainer}`;
            } else {
                return null;
            }
        }).filter(item => item !== null).join(' \n ');

        if(msg.trim() === '') {
            console.log('No classes available');
            return { statusCode: 200, body: JSON.stringify({ message: 'No classes available' }) };
        }

       // const msg = filteredData.map(item => item.msg).join(' \n ');

        // await client.messages.create({
        //     body: 'Parramatta Aquatic classes for SeaHorse:' + msg,
        //     to: '+61406104350',
        //     from: '+14243254033'
        // });
        console.log('Messages sent successfully');
        return { statusCode: 200, body: JSON.stringify({ message: 'Messages sent successfully' }) };
    

    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ error: 'An error occurred' })
        };
    }
};
