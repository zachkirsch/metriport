import { Sleep } from "@metriport/api";
import dayjs from "dayjs";
import convert from 'convert-units';

import { PROVIDER_GOOGLE } from "../../shared/constants";
import { GoogleSleep } from "./models/sleep";

const sourceIdSleep = "derived:com.google.sleep.segment:com.google.android.gms:merged";

export const mapToSleep = (googleSleep: GoogleSleep, date: string): Sleep => {
  const metadata = {
    date: date,
    source: PROVIDER_GOOGLE,
  };

  let sleep: Sleep = {
    metadata: metadata,
  };

  googleSleep.bucket[0].dataset.forEach((data) => {
    if (data.point.length) {

      const startTimeNanos = Number(data.point[0].startTimeNanos);
      const endTimeNanos = Number(data.point[0].endTimeNanos);

      if (data.dataSourceId === sourceIdSleep) {
        sleep.start_time = dayjs(convert(startTimeNanos).from('ns').to('ms')).format(
          "YYYY-MM-DDTHH:mm:ssZ"
        )
        sleep.end_time = dayjs(convert(endTimeNanos).from('ns').to('ms')).format(
          "YYYY-MM-DDTHH:mm:ssZ"
        )
      }
    }
  })

  return sleep;
};