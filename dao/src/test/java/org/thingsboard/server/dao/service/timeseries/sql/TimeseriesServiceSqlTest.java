/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.thingsboard.server.dao.service.timeseries.sql;

import org.junit.Test;
import org.thingsboard.server.common.data.kv.Aggregation;
import org.thingsboard.server.common.data.kv.BaseReadTsKvQuery;
import org.thingsboard.server.common.data.kv.BasicTsKvEntry;
import org.thingsboard.server.common.data.kv.ReadTsKvQuery;
import org.thingsboard.server.common.data.kv.StringDataEntry;
import org.thingsboard.server.common.data.kv.TsKvEntry;
import org.thingsboard.server.dao.service.DaoSqlTest;
import org.thingsboard.server.dao.service.timeseries.BaseTimeseriesServiceTest;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@DaoSqlTest
public class TimeseriesServiceSqlTest extends BaseTimeseriesServiceTest {

    @Test
    public void testFindLatestInRangeWithManyKeysAndExclusiveEnd() throws Exception {
        long startTs = 100_000L;
        long endTs = 200_000L;

        String key0 = "batchRangeKey00";
        String key1 = "batchRangeKey01";
        String key2 = "batchRangeKey02";

        // key0: verify lower bound inclusion, newest-in-window selection,
        // and that endTs itself is excluded.
        tsService.save(
                tenantId,
                deviceId,
                new BasicTsKvEntry(
                        startTs - 1,
                        new StringDataEntry(key0, "before-start")))
                .get(MAX_TIMEOUT, TimeUnit.SECONDS);

        tsService.save(
                tenantId,
                deviceId,
                new BasicTsKvEntry(
                        startTs,
                        new StringDataEntry(key0, "at-start")))
                .get(MAX_TIMEOUT, TimeUnit.SECONDS);

        tsService.save(
                tenantId,
                deviceId,
                new BasicTsKvEntry(
                        endTs - 1,
                        new StringDataEntry(key0, "latest-inside")))
                .get(MAX_TIMEOUT, TimeUnit.SECONDS);

        tsService.save(
                tenantId,
                deviceId,
                new BasicTsKvEntry(
                        endTs,
                        new StringDataEntry(key0, "at-end")))
                .get(MAX_TIMEOUT, TimeUnit.SECONDS);

        tsService.save(
                tenantId,
                deviceId,
                new BasicTsKvEntry(
                        endTs + 1,
                        new StringDataEntry(key0, "after-end")))
                .get(MAX_TIMEOUT, TimeUnit.SECONDS);

        // key1: multiple valid rows, newest valid row must win.
        tsService.save(
                tenantId,
                deviceId,
                new BasicTsKvEntry(
                        startTs + 100,
                        new StringDataEntry(key1, "older-inside")))
                .get(MAX_TIMEOUT, TimeUnit.SECONDS);

        tsService.save(
                tenantId,
                deviceId,
                new BasicTsKvEntry(
                        endTs - 2,
                        new StringDataEntry(key1, "newest-inside")))
                .get(MAX_TIMEOUT, TimeUnit.SECONDS);

        // key2: only a row exactly at endTs. It must be excluded.
        tsService.save(
                tenantId,
                deviceId,
                new BasicTsKvEntry(
                        endTs,
                        new StringDataEntry(key2, "excluded-at-end")))
                .get(MAX_TIMEOUT, TimeUnit.SECONDS);

        List<ReadTsKvQuery> queries = new ArrayList<>();

        for (int i = 0; i < 88; i++) {
            String key = String.format("batchRangeKey%02d", i);

            queries.add(
                    new BaseReadTsKvQuery(
                            key,
                            startTs,
                            endTs,
                            0,
                            1,
                            Aggregation.NONE,
                            "DESC"));
        }

        List<TsKvEntry> result = tsService.findLatestInRange(
                        tenantId,
                        deviceId,
                        queries)
                .get(MAX_TIMEOUT, TimeUnit.SECONDS);

        assertThat(result).hasSize(2);

        assertThat(result)
                .filteredOn(entry -> entry.getKey().equals(key0))
                .singleElement()
                .satisfies(entry -> {
                    assertThat(entry.getTs()).isEqualTo(endTs - 1);
                    assertThat(entry.getValueAsString())
                            .contains("latest-inside");
                });

        assertThat(result)
                .filteredOn(entry -> entry.getKey().equals(key1))
                .singleElement()
                .satisfies(entry -> {
                    assertThat(entry.getTs()).isEqualTo(endTs - 2);
                    assertThat(entry.getValueAsString())
                            .contains("newest-inside");
                });

        assertThat(result)
                .noneMatch(entry -> entry.getKey().equals(key2));

        assertThat(result)
                .noneMatch(entry -> entry.getTs() >= endTs);
    }


    @Test
    public void testRemoveLatestAndNoValuePresentInDB() throws ExecutionException, InterruptedException, TimeoutException {
        TsKvEntry tsKvEntry = toTsEntry(TS, stringKvEntry);
        tsService.save(tenantId, deviceId, tsKvEntry).get(MAX_TIMEOUT, TimeUnit.SECONDS);

        Optional<TsKvEntry> tsKvEntryOpt = tsService.findLatest(tenantId, deviceId, STRING_KEY).get(MAX_TIMEOUT, TimeUnit.SECONDS);

        assertThat(tsKvEntryOpt).isPresent();
        equalsIgnoreVersion(tsKvEntry, tsKvEntryOpt.get());
        assertThat(tsKvEntryOpt.get().getVersion()).isNotNull();

        tsService.removeLatest(tenantId, deviceId, List.of(STRING_KEY));

        await().alias("Wait until ts last is removed from the cache").atMost(MAX_TIMEOUT, TimeUnit.SECONDS)
                .pollInterval(1, TimeUnit.SECONDS)
                .untilAsserted(() -> {
                    Optional<TsKvEntry> tsKvEntryAfterRemoval = tsService.findLatest(tenantId, deviceId, STRING_KEY).get(MAX_TIMEOUT, TimeUnit.SECONDS);
                    assertThat(tsKvEntryAfterRemoval).isNotPresent();
                });
    }

}
